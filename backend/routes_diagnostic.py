from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from db import db, clean, clean_list
from auth_utils import get_current_user, new_id, now_iso
from logic import build_knowledge_from_diagnostic, grant_achievement, generate_study_plan
from grader import check_answer
import content_data as C

router = APIRouter()

DIAG_SIZE = 12


class StartIn(BaseModel):
    subject_id: str


class AnswerIn(BaseModel):
    question_id: str
    answer: Any


def strip_answer(q: dict) -> dict:
    """Question payload sent to client without the correct answer/explanation."""
    return {
        "id": q["id"], "question": q["question"], "options": q.get("options", []),
        "difficulty": q["difficulty"], "topic_id": q["topic_id"],
        "type": q.get("type", "single_choice"), "hint": q.get("hint", ""),
        "exam_part": q.get("exam_part", ""), "ege_category": q.get("ege_category"),
        "ege_task_number": q.get("ege_task_number", ""),
        "images": q.get("images", []),
        "answer_format": q.get("answer_format", "single_choice"),
        "match_left": q.get("match_left", []), "match_right": q.get("match_right", []),
        "order_items": q.get("order_items", []),
        "table_headers": q.get("table_headers", []), "table_rows": q.get("table_rows", []),
    }


@router.post("/diagnostics/start")
async def start_diagnostic(body: StartIn, user: dict = Depends(get_current_user)):
    subject = clean(await db.subjects.find_one({"id": body.subject_id}))
    if not subject:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    questions = clean_list(await db.questions.find({"subject_id": body.subject_id, "status": "published", "type": {"$ne": "extended_response"}}).to_list(200))
    if not questions:
        raise HTTPException(status_code=400, detail="По выбранным параметрам пока нет опубликованных заданий.")
    # spread across topics, biased toward EGE-level (harder first within each topic)
    _rank = {"ege": 0, "hard": 1, "medium": 2, "easy": 3}
    questions_sorted = sorted(questions, key=lambda q: (q["topic_id"], _rank.get(q["difficulty"], 2)))
    selected = questions_sorted[:DIAG_SIZE] if len(questions_sorted) <= DIAG_SIZE else _spread(questions_sorted)
    diag_id = new_id()
    await db.diagnostics.insert_one({
        "id": diag_id, "user_id": user["id"], "subject_id": body.subject_id,
        "subject_name": subject["name"], "question_ids": [q["id"] for q in selected],
        "status": "in_progress", "answers": [], "created_at": now_iso(),
    })
    return {
        "diagnostic_id": diag_id, "subject_id": body.subject_id,
        "subject_name": subject["name"],
        "questions": [strip_answer(q) for q in selected],
        "total": len(selected),
    }


def _spread(questions):
    by_topic = {}
    for q in questions:
        by_topic.setdefault(q["topic_id"], []).append(q)
    result, i = [], 0
    topics = list(by_topic.values())
    while len(result) < DIAG_SIZE and any(topics):
        t = topics[i % len(topics)]
        if t:
            result.append(t.pop(0))
        i += 1
        if all(len(x) == 0 for x in topics):
            break
    return result[:DIAG_SIZE]


@router.post("/diagnostics/{diag_id}/answer")
async def answer_diagnostic(diag_id: str, body: AnswerIn, user: dict = Depends(get_current_user)):
    diag = await db.diagnostics.find_one({"id": diag_id, "user_id": user["id"]})
    if not diag:
        raise HTTPException(status_code=404, detail="Диагностика не найдена")
    q = clean(await db.questions.find_one({"id": body.question_id}))
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    is_correct = check_answer(q, body.answer)
    answers = [a for a in diag.get("answers", []) if a["question_id"] != body.question_id]
    answers.append({
        "question_id": body.question_id, "topic_id": q["topic_id"],
        "answer": body.answer, "is_correct": is_correct, "difficulty": q["difficulty"],
    })
    await db.diagnostics.update_one({"id": diag_id}, {"$set": {"answers": answers}})
    return {"is_correct": is_correct, "correct_answer": q.get("answer"),
            "correct_value": q.get("answer_value"), "type": q.get("type", "single_choice"),
            "explanation": q["explanation"], "hint": q.get("hint", "")}


@router.post("/diagnostics/{diag_id}/finish")
async def finish_diagnostic(diag_id: str, user: dict = Depends(get_current_user)):
    diag = await db.diagnostics.find_one({"id": diag_id, "user_id": user["id"]})
    if not diag:
        raise HTTPException(status_code=404, detail="Диагностика не найдена")
    if diag.get("status") == "completed":
        return {"diagnostic_id": diag_id, "score": diag.get("score", 0), "level": diag.get("level")}
    answers = diag.get("answers", [])
    per_topic = {}
    for a in answers:
        st = per_topic.setdefault(a["topic_id"], {"correct": 0, "total": 0, "records": []})
        st["total"] += 1
        st["correct"] += 1 if a["is_correct"] else 0
        st["records"].append({"is_correct": a["is_correct"], "difficulty": a.get("difficulty", "medium")})

    subject_id = diag["subject_id"]
    await build_knowledge_from_diagnostic(user["id"], subject_id, per_topic)

    # record answers as question attempts so dashboard/statistics reflect diagnostic activity
    q_ids = [a["question_id"] for a in answers]
    qmap = {q["id"]: q for q in await db.questions.find({"id": {"$in": q_ids}}).to_list(200)}
    attempts = []
    for a in answers:
        q = qmap.get(a["question_id"], {})
        attempts.append({
            "id": new_id(), "user_id": user["id"], "question_id": a["question_id"],
            "subject_id": subject_id, "topic_id": a["topic_id"],
            "answer": a["answer"], "is_correct": a["is_correct"],
            "difficulty": q.get("difficulty", "medium"),
            "created_at": now_iso(), "source": "diagnostic",
        })
    if attempts:
        await db.question_attempts.insert_many(attempts)

    total = len(answers)
    correct = sum(1 for a in answers if a["is_correct"])
    overall = round((correct / total) * 100) if total else 0
    level = "Начальный" if overall < 40 else ("Средний" if overall < 70 else "Высокий")
    est_score = round(overall * 0.9 + 10)  # rough demo mapping to 0-100

    await db.diagnostics.update_one({"id": diag_id}, {"$set": {
        "status": "completed", "score": overall, "level": level,
        "estimated_score": est_score, "finished_at": now_iso(),
    }})
    await grant_achievement(user["id"], "first_diagnostic")
    return {"diagnostic_id": diag_id, "score": overall, "level": level}


@router.get("/diagnostics/{diag_id}/results")
async def diagnostic_results(diag_id: str, user: dict = Depends(get_current_user)):
    diag = clean(await db.diagnostics.find_one({"id": diag_id, "user_id": user["id"]}))
    if not diag:
        raise HTTPException(status_code=404, detail="Диагностика не найдена")
    idx = C.topic_index()
    per_topic = {}
    for a in diag.get("answers", []):
        st = per_topic.setdefault(a["topic_id"], {"correct": 0, "total": 0})
        st["total"] += 1
        st["correct"] += 1 if a["is_correct"] else 0
    topics = []
    for tid, st in per_topic.items():
        mastery = round((st["correct"] / st["total"]) * 100) if st["total"] else 0
        topics.append({"topic_id": tid, "name": idx.get(tid, {}).get("name", tid), "mastery": mastery})
    topics.sort(key=lambda t: t["mastery"], reverse=True)
    strong = [t for t in topics if t["mastery"] >= 70]
    weak = [t for t in topics if t["mastery"] < 50]
    recommendations = [t["name"] for t in weak] or [t["name"] for t in topics[-2:]]
    return {
        "diagnostic_id": diag_id, "subject_id": diag["subject_id"],
        "subject_name": diag["subject_name"], "score": diag.get("score", 0),
        "level": diag.get("level"), "estimated_score": diag.get("estimated_score"),
        "topics": topics, "strong": strong, "weak": weak,
        "recommendations": recommendations,
    }


@router.get("/diagnostics")
async def my_diagnostics(user: dict = Depends(get_current_user)):
    diags = clean_list(await db.diagnostics.find(
        {"user_id": user["id"], "status": "completed"}).sort("finished_at", -1).to_list(50))
    return [{"id": d["id"], "subject_id": d["subject_id"], "subject_name": d["subject_name"],
             "score": d.get("score"), "level": d.get("level"), "finished_at": d.get("finished_at")}
            for d in diags]
