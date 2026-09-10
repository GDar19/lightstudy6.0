from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from db import db, clean, clean_list
from auth_utils import get_current_user, new_id, now_iso
from logic import update_mastery, grant_achievement
from grader import check_answer
import content_data as C

router = APIRouter()

MOCK_SIZE = 15
MOCK_DURATION_MIN = 40


class StartMockIn(BaseModel):
    subject_id: str


class MockSubmitIn(BaseModel):
    answers: dict  # {question_id: answer}
    time_spent: Optional[int] = 0


def strip_answer(q: dict) -> dict:
    return {"id": q["id"], "question": q["question"], "options": q.get("options", []),
            "difficulty": q["difficulty"], "topic_id": q["topic_id"],
            "type": q.get("type", "single_choice"), "hint": q.get("hint", ""),
            "exam_part": q.get("exam_part", ""), "ege_category": q.get("ege_category"),
            "ege_task_number": q.get("ege_task_number", ""), "images": q.get("images", [])}


@router.get("/mock-exams")
async def list_mock_exams(user: dict = Depends(get_current_user)):
    subjects = clean_list(await db.subjects.find(
        {"id": {"$in": user.get("subjects", [])}}).to_list(50))
    attempts = clean_list(await db.mock_exam_attempts.find(
        {"user_id": user["id"], "status": "completed"}).sort("finished_at", -1).to_list(50))
    for s in subjects:
        s["duration"] = MOCK_DURATION_MIN
        s["question_count"] = MOCK_SIZE
        s_attempts = [a for a in attempts if a["subject_id"] == s["id"]]
        s["best_score"] = max((a["score"] for a in s_attempts), default=None)
        s["attempts"] = len(s_attempts)
    return {"exams": subjects, "history": attempts}


@router.post("/mock-exams/start")
async def start_mock(body: StartMockIn, user: dict = Depends(get_current_user)):
    subject = clean(await db.subjects.find_one({"id": body.subject_id}))
    if not subject:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    questions = clean_list(await db.questions.find({"subject_id": body.subject_id, "status": "published", "type": {"$ne": "extended_response"}}).to_list(300))
    if not questions:
        raise HTTPException(status_code=400, detail="По выбранному предмету пока нет опубликованных заданий для пробника.")
    # exam-like selection: bias toward hard/ege, keep some medium
    _rank = {"ege": 0, "hard": 1, "medium": 2, "easy": 3}
    import random
    random.shuffle(questions)
    questions.sort(key=lambda q: _rank.get(q["difficulty"], 2))
    selected = questions[:MOCK_SIZE]
    attempt_id = new_id()
    await db.mock_exam_attempts.insert_one({
        "id": attempt_id, "user_id": user["id"], "subject_id": body.subject_id,
        "subject_name": subject["name"], "question_ids": [q["id"] for q in selected],
        "status": "in_progress", "duration": MOCK_DURATION_MIN,
        "created_at": now_iso(),
    })
    return {
        "attempt_id": attempt_id, "subject_id": body.subject_id,
        "subject_name": subject["name"], "duration_min": MOCK_DURATION_MIN,
        "questions": [strip_answer(q) for q in selected], "total": len(selected),
    }


@router.post("/mock-exams/{attempt_id}/finish")
async def finish_mock(attempt_id: str, body: MockSubmitIn, user: dict = Depends(get_current_user)):
    attempt = await db.mock_exam_attempts.find_one({"id": attempt_id, "user_id": user["id"]})
    if not attempt:
        raise HTTPException(status_code=404, detail="Пробник не найден")
    questions = clean_list(await db.questions.find(
        {"id": {"$in": attempt["question_ids"]}}).to_list(200))
    idx = C.topic_index()

    correct = 0
    per_topic = {}
    review = []
    for q in questions:
        ans = body.answers.get(q["id"])
        is_correct = ans is not None and check_answer(q, ans)
        if is_correct:
            correct += 1
        st = per_topic.setdefault(q["topic_id"], {"correct": 0, "total": 0})
        st["total"] += 1
        st["correct"] += 1 if is_correct else 0
        # feed back into knowledge profile (difficulty-weighted)
        await update_mastery(user["id"], q["subject_id"], q["topic_id"], is_correct, q["difficulty"])
        await db.question_attempts.insert_one({
            "id": new_id(), "user_id": user["id"], "question_id": q["id"],
            "subject_id": q["subject_id"], "topic_id": q["topic_id"],
            "answer": ans if ans is not None else -1, "is_correct": is_correct,
            "difficulty": q["difficulty"], "created_at": now_iso(), "source": "mock",
        })
        if not is_correct:
            review.append({
                "question": q["question"], "options": q.get("options", []),
                "images": q.get("images", []),
                "student_answer": ans, "correct_answer": q.get("answer"),
                "correct_value": q.get("answer_value"), "type": q.get("type", "single_choice"),
                "explanation": q["explanation"],
                "topic_name": idx.get(q["topic_id"], {}).get("name", q["topic_id"]),
            })

    total = len(questions)
    accuracy = round((correct / total) * 100) if total else 0
    est_score = round(accuracy * 0.9 + 10)
    topic_breakdown = [
        {"topic": idx.get(t, {}).get("name", t),
         "mastery": round((v["correct"] / v["total"]) * 100) if v["total"] else 0}
        for t, v in per_topic.items()
    ]
    recommendations = [tb["topic"] for tb in sorted(topic_breakdown, key=lambda x: x["mastery"])[:3]]

    await db.mock_exam_attempts.update_one({"id": attempt_id}, {"$set": {
        "status": "completed", "score": est_score, "accuracy": accuracy,
        "correct": correct, "total": total, "time_spent": body.time_spent,
        "topic_breakdown": topic_breakdown, "review": review,
        "recommendations": recommendations, "finished_at": now_iso(),
    }})
    await grant_achievement(user["id"], "first_mock")

    return {
        "attempt_id": attempt_id, "score": est_score, "accuracy": accuracy,
        "correct": correct, "total": total, "time_spent": body.time_spent,
        "topic_breakdown": topic_breakdown, "review": review,
        "recommendations": recommendations,
    }


@router.get("/mock-exams/{attempt_id}")
async def get_mock_result(attempt_id: str, user: dict = Depends(get_current_user)):
    attempt = clean(await db.mock_exam_attempts.find_one(
        {"id": attempt_id, "user_id": user["id"]}))
    if not attempt:
        raise HTTPException(status_code=404, detail="Пробник не найден")
    return attempt
