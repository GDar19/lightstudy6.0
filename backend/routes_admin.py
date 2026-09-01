from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from db import db, clean, clean_list
from auth_utils import require_admin, new_id, now_iso
import content_data as C

router = APIRouter()


class QuestionIn(BaseModel):
    subject_id: str
    topic_id: str
    difficulty: str = "medium"
    question: str
    options: List[str]
    answer: int
    explanation: str = ""
    ege_category: Optional[str] = ""


@router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    return {
        "users": await db.users.count_documents({"role": "student"}),
        "questions": await db.questions.count_documents({}),
        "subjects": await db.subjects.count_documents({}),
        "lessons": await db.lessons.count_documents({}),
        "diagnostics": await db.diagnostics.count_documents({"status": "completed"}),
        "practice_attempts": await db.question_attempts.count_documents({}),
        "mock_exams": await db.mock_exam_attempts.count_documents({"status": "completed"}),
    }


@router.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    users = clean_list(await db.users.find({}, {"password_hash": 0}).to_list(500))
    return users


@router.get("/admin/questions")
async def admin_questions(subject_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    q = {"subject_id": subject_id} if subject_id else {}
    questions = clean_list(await db.questions.find(q).to_list(1000))
    return questions


@router.post("/admin/questions")
async def create_question(body: QuestionIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["type"] = "single_choice"
    doc["source"] = "admin"
    doc["created_at"] = now_iso()
    await db.questions.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.patch("/admin/questions/{qid}")
async def update_question(qid: str, body: QuestionIn, admin: dict = Depends(require_admin)):
    existing = await db.questions.find_one({"id": qid})
    if not existing:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    await db.questions.update_one({"id": qid}, {"$set": body.model_dump()})
    return clean(await db.questions.find_one({"id": qid}))


@router.delete("/admin/questions/{qid}")
async def delete_question(qid: str, admin: dict = Depends(require_admin)):
    res = await db.questions.delete_one({"id": qid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    return {"ok": True}


@router.get("/admin/topics")
async def admin_topics(admin: dict = Depends(require_admin)):
    idx = C.topic_index()
    return [{"topic_id": tid, **info} for tid, info in idx.items()]
