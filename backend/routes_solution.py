"""Part 2 (extended-response) tasks: browse, submit typed answer + handwritten solution photos,
and get AI-assisted multimodal per-criterion evaluation."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional, List

from db import db, clean, clean_list
from auth_utils import get_current_user, new_id, now_iso
import content_data as C
import media_service
import solution_analysis
from ai_service import ai_available

router = APIRouter()

MAX_UPLOAD = 12 * 1024 * 1024
MAX_IMAGES = 5


def _public_task(q: dict) -> dict:
    """Task view for students (keeps scoring criteria + images, hides internal fields harmlessly)."""
    return {
        "id": q["id"], "subject_id": q["subject_id"], "topic_id": q["topic_id"],
        "difficulty": q["difficulty"], "type": q.get("type"), "question": q["question"],
        "images": q.get("images", []), "exam_part": q.get("exam_part", ""),
        "ege_task_number": q.get("ege_task_number", ""), "hint": q.get("hint", ""),
        "scoring": q.get("scoring") or {"max_score": 0, "criteria": []},
    }


@router.get("/part2/tasks")
async def list_part2(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    q = {"type": "extended_response"}
    if subject_id:
        q["subject_id"] = subject_id
    if topic_id:
        q["topic_id"] = topic_id
    tasks = clean_list(await db.questions.find(q).sort("created_at", -1).to_list(200))
    return [_public_task(t) for t in tasks]


@router.get("/part2/tasks/{qid}")
async def get_part2(qid: str, user: dict = Depends(get_current_user)):
    q = clean(await db.questions.find_one({"id": qid, "type": "extended_response"}))
    if not q:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    subs = clean_list(await db.solution_submissions.find(
        {"user_id": user["id"], "question_id": qid}).sort("created_at", -1).to_list(20))
    return {"task": _public_task(q), "submissions": subs}


@router.post("/part2/tasks/{qid}/submit")
async def submit_solution(
    qid: str,
    typed_answer: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(get_current_user),
):
    q = clean(await db.questions.find_one({"id": qid, "type": "extended_response"}))
    if not q:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    if not files and not typed_answer.strip():
        raise HTTPException(status_code=400, detail="Загрузите фото решения или введите ответ текстом")
    if files and len(files) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Не более {MAX_IMAGES} изображений")

    stored, images_b64 = [], []
    for f in (files or []):
        data = await f.read()
        if not data:
            continue
        if len(data) > MAX_UPLOAD:
            raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 12 МБ)")
        try:
            media = await media_service.store_image(data, f.filename or "solution", user["id"], "solution")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        stored.append({"media_id": media["media_id"], "url": media["url"]})
        b64, _ = await media_service.get_image_base64(media["media_id"])
        if b64:
            images_b64.append(b64)

    analysis = None
    if ai_available():
        try:
            analysis = await solution_analysis.analyze_solution(
                new_id(), q, images_b64, typed_answer.strip(), q["subject_id"])
        except Exception:
            analysis = None

    sub = {
        "id": new_id(), "user_id": user["id"], "question_id": qid,
        "subject_id": q["subject_id"], "topic_id": q["topic_id"],
        "typed_answer": typed_answer.strip(), "images": stored,
        "analysis": analysis, "created_at": now_iso(),
    }
    await db.solution_submissions.insert_one(dict(sub))
    sub.pop("_id", None)
    return {"submission": sub, "analysis": analysis, "available": ai_available()}


@router.get("/part2/submissions")
async def my_submissions(user: dict = Depends(get_current_user)):
    return clean_list(await db.solution_submissions.find(
        {"user_id": user["id"]}).sort("created_at", -1).to_list(100))
