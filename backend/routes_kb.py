from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from db import db, clean, clean_list
from auth_utils import require_admin, new_id, now_iso
import kb_service

router = APIRouter()

DOC_TYPES = ["textbook", "ege_spec", "ege_demo", "ege_codifier", "methodical", "other"]


@router.post("/admin/kb/upload")
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    subject_id: str = Form(""),
    grade: str = Form(""),
    doc_type: str = Form("textbook"),
    admin: dict = Depends(require_admin),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Поддерживаются только PDF-файлы")
    doc_id = new_id()
    data = await file.read()
    gridfs_id = await kb_service.store_file(data, file.filename)
    doc = {
        "id": doc_id, "title": title, "subject_id": subject_id or None, "grade": grade or None,
        "doc_type": doc_type if doc_type in DOC_TYPES else "other",
        "filename": file.filename, "gridfs_id": gridfs_id, "size": len(data),
        "status": "processing", "pages": 0, "chunks": 0,
        "uploaded_by": admin["id"], "created_at": now_iso(),
    }
    await db.kb_documents.insert_one(dict(doc))
    background.add_task(kb_service.process_document, doc_id)
    doc.pop("_id", None)
    return doc


@router.get("/admin/kb")
async def list_documents(admin: dict = Depends(require_admin)):
    return clean_list(await db.kb_documents.find({}, {"gridfs_id": 0}).sort("created_at", -1).to_list(200))


@router.delete("/admin/kb/{doc_id}")
async def delete_document(doc_id: str, admin: dict = Depends(require_admin)):
    doc = await db.kb_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    if doc.get("gridfs_id"):
        await kb_service.delete_file(doc["gridfs_id"])
    await db.kb_chunks.delete_many({"doc_id": doc_id})
    await db.kb_documents.delete_one({"id": doc_id})
    return {"ok": True}


@router.post("/admin/kb/{doc_id}/reprocess")
async def reprocess_document(doc_id: str, background: BackgroundTasks, admin: dict = Depends(require_admin)):
    doc = await db.kb_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    await db.kb_documents.update_one({"id": doc_id}, {"$set": {"status": "processing"}})
    background.add_task(kb_service.process_document, doc_id)
    return {"ok": True}


class KbSearchIn(BaseModel):
    subject_id: Optional[str] = None
    query: str


@router.post("/admin/kb/search")
async def search_kb(body: KbSearchIn, admin: dict = Depends(require_admin)):
    return {"results": await kb_service.retrieve(body.subject_id, body.query, k=5)}
