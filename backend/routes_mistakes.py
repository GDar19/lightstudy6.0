from fastapi import APIRouter, Depends
from db import db, clean_list
from auth_utils import get_current_user

router = APIRouter()


@router.get("/mistakes")
async def list_mistakes(user: dict = Depends(get_current_user)):
    mistakes = clean_list(await db.mistakes.find(
        {"user_id": user["id"]}).sort("created_at", -1).to_list(200))
    return mistakes


@router.post("/mistakes/retry")
async def retry_mistakes(user: dict = Depends(get_current_user)):
    """Returns unresolved mistakes as a practice-style set."""
    mistakes = clean_list(await db.mistakes.find(
        {"user_id": user["id"], "resolved": {"$ne": True}}).to_list(50))
    questions = []
    for m in mistakes:
        questions.append({
            "id": m["question_id"], "question": m["question"], "options": m["options"],
            "difficulty": m.get("difficulty", "medium"), "topic_id": m["topic_id"],
            "subject_id": m["subject_id"],
        })
    return {"questions": questions, "total": len(questions)}
