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


class PracticeAnswerIn(BaseModel):
    session_id: str
    question_id: str
    answer: Any


def strip_answer(q: dict) -> dict:
    return {"id": q["id"], "question": q["question"], "options": q.get("options", []),
            "difficulty": q["difficulty"], "topic_id": q["topic_id"],
            "type": q.get("type", "single_choice"), "hint": q.get("hint", ""),
            "exam_part": q.get("exam_part", ""), "ege_category": q.get("ege_category")}


async def _recommended_difficulty(user_id: str, topic_id: str) -> str:
    k = await db.knowledge.find_one({"user_id": user_id, "topic_id": topic_id})
    return (k or {}).get("difficulty", "medium")


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
        questions = clean_list(await db.questions.find(query).to_list(300))

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
        "explanation": q["explanation"], "hint": q.get("hint", ""),
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
