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
    type: str = "single_choice"
    question: str
    options: List[str] = []
    answer: Optional[object] = None
    answer_value: Optional[object] = None
    explanation: str = ""
    solution: str = ""              # detailed step-by-step solution
    hint: str = ""
    exam_part: Optional[str] = ""
    ege_task_number: Optional[str] = ""
    tags: List[str] = []
    ege_category: Optional[str] = ""
    # first-class media: [{media_id, url, caption, kind}]
    images: List[dict] = []
    # type-specific payloads
    answer_format: Optional[str] = "single_choice"   # for graph/diagram/image_analysis
    match_left: List[str] = []
    match_right: List[str] = []
    match_answer: List[int] = []
    order_items: List[str] = []
    order_answer: List[int] = []
    table_headers: List[str] = []
    table_rows: List[List[str]] = []
    table_answer: List[str] = []
    # extended-response (Part 2) scoring criteria
    scoring: Optional[dict] = None   # {max_score:int, criteria:[{title,description,required,common_errors}]}
    # traceability
    source_doc_id: Optional[str] = None
    source_page: Optional[int] = None
    source_context: Optional[str] = None
    verified: bool = False
    ai_generated: bool = False


class VerifyIn(BaseModel):
    verified: bool


class SubjectToggleIn(BaseModel):
    enabled: bool


@router.get("/admin/subjects")
async def admin_subjects(admin: dict = Depends(require_admin)):
    return clean_list(await db.subjects.find({}).to_list(100))


@router.patch("/admin/subjects/{sid}")
async def toggle_subject(sid: str, body: SubjectToggleIn, admin: dict = Depends(require_admin)):
    res = await db.subjects.update_one({"id": sid}, {"$set": {"enabled": body.enabled}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    return clean(await db.subjects.find_one({"id": sid}))


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
async def admin_questions(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                          qtype: Optional[str] = None, verified: Optional[bool] = None,
                          ai_generated: Optional[bool] = None, has_images: Optional[bool] = None,
                          admin: dict = Depends(require_admin)):
    q = {}
    if subject_id:
        q["subject_id"] = subject_id
    if topic_id:
        q["topic_id"] = topic_id
    if qtype:
        q["type"] = qtype
    if verified is not None:
        q["verified"] = verified
    if ai_generated is not None:
        q["ai_generated"] = ai_generated
    if has_images is True:
        q["images.0"] = {"$exists": True}
    questions = clean_list(await db.questions.find(q).sort("created_at", -1).to_list(1000))
    return questions


@router.post("/admin/questions")
async def create_question(body: QuestionIn, admin: dict = Depends(require_admin)):
    from grader import DIFFICULTY_LEVEL
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["difficulty_level"] = DIFFICULTY_LEVEL.get(doc.get("difficulty", "medium"), 3)
    doc["source"] = "admin"
    doc["created_at"] = now_iso()
    await db.questions.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.patch("/admin/questions/{qid}")
async def update_question(qid: str, body: QuestionIn, admin: dict = Depends(require_admin)):
    from grader import DIFFICULTY_LEVEL
    existing = await db.questions.find_one({"id": qid})
    if not existing:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    upd = body.model_dump()
    upd["difficulty_level"] = DIFFICULTY_LEVEL.get(upd.get("difficulty", "medium"), 3)
    await db.questions.update_one({"id": qid}, {"$set": upd})
    return clean(await db.questions.find_one({"id": qid}))


@router.patch("/admin/questions/{qid}/verify")
async def verify_question(qid: str, body: VerifyIn, admin: dict = Depends(require_admin)):
    res = await db.questions.update_one({"id": qid}, {"$set": {"verified": body.verified}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
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
