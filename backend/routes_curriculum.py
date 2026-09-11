from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from db import db, clean, clean_list
from auth_utils import get_current_user, require_admin, new_id, now_iso
import curriculum as CUR

router = APIRouter()


# ---------- student-facing ----------
@router.get("/curriculum/{subject_id}")
async def get_curriculum(subject_id: str, user: dict = Depends(get_current_user)):
    rows = clean_list(await db.curriculum.find({"subject_id": subject_id}).to_list(500))
    return sorted(rows, key=lambda r: r.get("order", 0))


@router.get("/curriculum/{subject_id}/progress")
async def get_progress(subject_id: str, user: dict = Depends(get_current_user)):
    return await CUR.subject_progress(user["id"], subject_id)


@router.get("/curriculum/{subject_id}/current")
async def get_current(subject_id: str, user: dict = Depends(get_current_user)):
    return {"current_topic": await CUR.current_topic(user["id"], subject_id)}


@router.get("/curriculum/{subject_id}/next")
async def get_next(subject_id: str, user: dict = Depends(get_current_user)):
    return {"next_topic": await CUR.next_topic(user["id"], subject_id)}


# ---------- admin CRUD ----------
class CurriculumIn(BaseModel):
    subject_id: str
    section_id: Optional[str] = ""
    topic_id: str
    subtopic_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    order: int = 0
    ege_task_numbers: List[str] = []
    prerequisite_ids: List[str] = []
    is_active: bool = True


class CurriculumPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None
    subtopic_id: Optional[str] = None
    ege_task_numbers: Optional[List[str]] = None
    prerequisite_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.get("/admin/curriculum")
async def admin_list(subject_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    q = {"subject_id": subject_id} if subject_id else {}
    rows = clean_list(await db.curriculum.find(q).to_list(1000))
    return sorted(rows, key=lambda r: (r.get("subject_id"), r.get("order", 0)))


@router.post("/admin/curriculum")
async def admin_create(body: CurriculumIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.curriculum.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.patch("/admin/curriculum/{cid}")
async def admin_update(cid: str, body: CurriculumPatch, admin: dict = Depends(require_admin)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    res = await db.curriculum.update_one({"id": cid}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Тема curriculum не найдена")
    return clean(await db.curriculum.find_one({"id": cid}))


@router.delete("/admin/curriculum/{cid}")
async def admin_delete(cid: str, admin: dict = Depends(require_admin)):
    await db.curriculum.update_one({"id": cid}, {"$set": {"is_active": False}})
    return {"ok": True}
