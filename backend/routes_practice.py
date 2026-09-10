from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any

from db import db, clean, clean_list
from auth_utils import get_current_user, new_id, now_iso
from logic import update_mastery, grant_achievement, check_task_achievements
from grader import check_answer
import content_data as C

router = APIRouter()


class StartPracticeIn(BaseModel):
    subject_id: str
    topic_id: Optional[str] = None
    mode: Optional[str] = "adaptive"  # adaptive | mistakes
    difficulty: Optional[str] = None   # easy | medium | hard | ege | None(all)
    count: Optional[int] = 10
    qtype: Optional[str] = None
    smart: Optional[bool] = False      # hybrid: top up with AI-generated, KB-grounded tasks


class PracticeAnswerIn(BaseModel):
    session_id: str
    question_id: str
    answer: Any


def strip_answer(q: dict) -> dict:
    return {"id": q["id"], "question": q["question"], "options": q.get("options", []),
            "difficulty": q["difficulty"], "topic_id": q["topic_id"],
            "type": q.get("type", "single_choice"), "hint": q.get("hint", ""),
            "exam_part": q.get("exam_part", ""), "ege_category": q.get("ege_category"),
            "ege_task_number": q.get("ege_task_number", ""),
            "images": q.get("images", []),
            "answer_format": q.get("answer_format", "single_choice"),
            "match_left": q.get("match_left", []), "match_right": q.get("match_right", []),
            "order_items": q.get("order_items", []),
            "table_headers": q.get("table_headers", []), "table_rows": q.get("table_rows", [])}


async def _recommended_difficulty(user_id: str, topic_id: str) -> str:
    k = await db.knowledge.find_one({"user_id": user_id, "topic_id": topic_id})
    return (k or {}).get("difficulty", "medium")


async def generate_and_store_tasks(subject_id: str, topic_id: str, difficulty: str, n: int) -> list:
    """Generate up to n EGE-level tasks via the multimodal AI grounded in the Knowledge Base,
    validate them, persist to `questions` with source traceability (hybrid task bank)."""
    from ai_service import AIService, ai_available
    from grader import DIFFICULTY_LEVEL
    import asyncio, kb_service
    if n <= 0 or not ai_available():
        return []
    idx = C.topic_index()
    info = idx.get(topic_id, {})
    topic_name = info.get("name", topic_id)
    subject_name = info.get("subject_name", subject_id)
    try:
        mm = await kb_service.retrieve_multimodal(subject_id, topic_name, k=3, max_images=1)
    except Exception:
        mm = {"snippets": [], "figures": [], "images_b64": []}
    material, sources = kb_service.build_rag_context(mm["snippets"], mm["figures"])
    src = next((s for s in sources if s.get("type") == "text"), None) or (sources[0] if sources else None)
    ctx_text = " ".join(s.get("text", "")[:200] for s in mm["snippets"][:2]) if mm["snippets"] else ""

    async def one():
        try:
            return await AIService.generate_question(new_id(), topic_name, subject_name,
                                                      difficulty, source_material=material, images=mm["images_b64"])
        except Exception:
            return None
    results = await asyncio.gather(*[one() for _ in range(n)])

    stored = []
    for q in results:
        if not q or not isinstance(q, dict):
            continue
        question = str(q.get("question", "")).strip()
        options = q.get("options") or []
        answer = q.get("answer")
        if not question or not isinstance(options, list) or len(options) < 2:
            continue
        try:
            answer = int(answer)
        except Exception:
            continue
        if answer < 0 or answer >= len(options):
            continue
        doc = {
            "id": new_id(), "subject_id": subject_id, "topic_id": topic_id,
            "type": "single_choice", "difficulty": difficulty,
            "difficulty_level": DIFFICULTY_LEVEL.get(difficulty, 3),
            "question": question, "options": [str(o) for o in options], "answer": answer,
            "answer_value": None, "explanation": str(q.get("explanation", "")),
            "hint": "", "exam_part": "", "ege_category": "", "images": [],
            "source": "ai", "ai_generated": True, "verified": False,
            "source_doc_id": (src or {}).get("doc_id"), "source_page": (src or {}).get("page"),
            "source_doc_title": (src or {}).get("doc_title"),
            "source_context": ctx_text or None, "topic_name": topic_name, "subject_name": subject_name,
            "created_at": now_iso(),
        }
        await db.questions.insert_one(dict(doc))
        doc.pop("_id", None)
        stored.append(doc)
    return stored


@router.post("/practice/start")
async def start_practice(body: StartPracticeIn, user: dict = Depends(get_current_user)):
    query = {"subject_id": body.subject_id}
    if body.topic_id:
        query["topic_id"] = body.topic_id

    if body.mode == "mistakes":
        mistakes = clean_list(await db.mistakes.find({"user_id": user["id"]}).to_list(100))
        qids = list({m["question_id"] for m in mistakes})
        if body.topic_id:
            qids = [m["question_id"] for m in mistakes if m["topic_id"] == body.topic_id]
        questions = clean_list(await db.questions.find({"id": {"$in": qids}}).to_list(100))
    else:
        query = {"subject_id": body.subject_id}
        if body.topic_id:
            query["topic_id"] = body.topic_id
        if body.difficulty:
            query["difficulty"] = body.difficulty
        if body.qtype:
            query["type"] = body.qtype
        else:
            # extended-response (Part 2) tasks are graded separately, not in adaptive practice
            query["type"] = {"$ne": "extended_response"}
        questions = clean_list(await db.questions.find(query).to_list(300))

    # hybrid smart mode: top up with fresh AI-generated, KB-grounded EGE tasks
    if body.smart and body.mode != "mistakes" and body.topic_id:
        want = max(1, min(body.count or 10, 40))
        gen_diff = body.difficulty or await _recommended_difficulty(user["id"], body.topic_id)
        need = min(5, max(1, want - len(questions)))
        generated = await generate_and_store_tasks(body.subject_id, body.topic_id, gen_diff, need)
        questions = generated + questions

    if not questions:
        raise HTTPException(status_code=400, detail="Нет заданий по заданным параметрам")

    # adaptive: prefer recommended difficulty for the topic
    if body.topic_id and body.mode == "adaptive" and not body.difficulty:
        diff = await _recommended_difficulty(user["id"], body.topic_id)
        preferred = [q for q in questions if q["difficulty"] == diff]
        questions = (preferred + [q for q in questions if q not in preferred])

    import random
    random.shuffle(questions)
    count = max(1, min(body.count or 10, 40))
    session_id = new_id()
    qids = [q["id"] for q in questions][:count]
    await db.practice_sessions.insert_one({
        "id": session_id, "user_id": user["id"], "subject_id": body.subject_id,
        "topic_id": body.topic_id, "mode": body.mode, "question_ids": qids,
        "answered": [], "status": "in_progress", "created_at": now_iso(),
    })
    qmap = {q["id"]: q for q in questions}
    return {"session_id": session_id, "questions": [strip_answer(qmap[i]) for i in qids],
            "total": len(qids)}


@router.post("/practice/answer")
async def practice_answer(body: PracticeAnswerIn, user: dict = Depends(get_current_user)):
    session = await db.practice_sessions.find_one({"id": body.session_id, "user_id": user["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    q = clean(await db.questions.find_one({"id": body.question_id}))
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    is_correct = check_answer(q, body.answer)

    # record attempt
    await db.question_attempts.insert_one({
        "id": new_id(), "user_id": user["id"], "question_id": q["id"],
        "subject_id": q["subject_id"], "topic_id": q["topic_id"],
        "answer": body.answer, "is_correct": is_correct,
        "difficulty": q["difficulty"], "created_at": now_iso(),
    })

    # update mastery + adaptive difficulty (difficulty-weighted)
    mastery, difficulty = await update_mastery(
        user["id"], q["subject_id"], q["topic_id"], is_correct, q["difficulty"])

    # mistakes handling
    if not is_correct:
        await db.mistakes.update_one(
            {"user_id": user["id"], "question_id": q["id"]},
            {
                "$setOnInsert": {"id": new_id(), "created_at": now_iso()},
                "$set": {
                    "user_id": user["id"], "question_id": q["id"],
                    "subject_id": q["subject_id"], "topic_id": q["topic_id"],
                    "topic_name": C.topic_index().get(q["topic_id"], {}).get("name", q["topic_id"]),
                    "subject_name": C.topic_index().get(q["topic_id"], {}).get("subject_name", q["subject_id"]),
                    "question": q["question"], "options": q["options"],
                    "student_answer": body.answer, "correct_answer": q.get("answer"),
                    "correct_value": q.get("answer_value"), "type": q.get("type", "single_choice"),
                    "explanation": q["explanation"], "difficulty": q["difficulty"],
                    "resolved": False,
                },
            },
            upsert=True,
        )
    else:
        # if previously a mistake and now correct, mark resolved
        await db.mistakes.update_one(
            {"user_id": user["id"], "question_id": q["id"]},
            {"$set": {"resolved": True, "resolved_at": now_iso()}},
        )

    session["answered"] = list(session.get("answered", [])) + [q["id"]]
    await db.practice_sessions.update_one({"id": body.session_id}, {"$set": {"answered": session["answered"]}})

    if mastery >= 90:
        await grant_achievement(user["id"], "topic_mastered")
    await check_task_achievements(user["id"])

    return {
        "is_correct": is_correct, "correct_answer": q.get("answer"),
        "correct_value": q.get("answer_value"), "type": q.get("type", "single_choice"),
        "match_answer": q.get("match_answer"), "order_answer": q.get("order_answer"),
        "table_answer": q.get("table_answer"),
        "explanation": q["explanation"], "solution": q.get("solution", ""), "hint": q.get("hint", ""),
        "mastery": mastery, "difficulty": difficulty,
    }


@router.post("/practice/{session_id}/finish")
async def finish_practice(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.practice_sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    answered = session.get("answered", [])
    attempts = clean_list(await db.question_attempts.find(
        {"user_id": user["id"], "question_id": {"$in": answered}}
    ).sort("created_at", -1).to_list(len(answered) if answered else 1))
    # keep only latest per question
    seen, correct = set(), 0
    for a in attempts:
        if a["question_id"] in seen:
            continue
        seen.add(a["question_id"])
        if a["is_correct"]:
            correct += 1
    total = len(answered)
    accuracy = round((correct / total) * 100) if total else 0
    await db.practice_sessions.update_one({"id": session_id}, {"$set": {
        "status": "completed", "correct": correct, "total": total,
        "accuracy": accuracy, "finished_at": now_iso(),
    }})
    # mark matching plan practice item done
    if session.get("topic_id"):
        await db.study_plan_items.update_many(
            {"user_id": user["id"], "topic_id": session["topic_id"],
             "activity_type": {"$in": ["practice", "review"]}, "status": "planned"},
            {"$set": {"status": "done", "completion": 100}},
        )
    return {"correct": correct, "total": total, "accuracy": accuracy}
