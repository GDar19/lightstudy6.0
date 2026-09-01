from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from db import db, clean, clean_list
from auth_utils import get_current_user, new_id, now_iso
from ai_service import AIService, ai_available
import content_data as C

router = APIRouter()

AI_UNAVAILABLE = "ИИ-помощник временно недоступен. Попробуй ещё раз."

# simple in-memory per-user rate limiter (protects the paid LLM provider)
import time as _time
_RATE = {}
_RATE_MAX = 20        # requests
_RATE_WINDOW = 60     # seconds


def _rate_limit(user_id: str):
    now = _time.time()
    bucket = [t for t in _RATE.get(user_id, []) if now - t < _RATE_WINDOW]
    if len(bucket) >= _RATE_MAX:
        raise HTTPException(status_code=429, detail="Слишком много запросов к ИИ. Подожди немного.")
    bucket.append(now)
    _RATE[user_id] = bucket


class ChatIn(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    lesson_id: Optional[str] = None
    problem: Optional[str] = None


class ExplainIn(BaseModel):
    topic_id: Optional[str] = None
    topic_name: Optional[str] = None
    subject_name: Optional[str] = None
    mode: Optional[str] = "default"


class GenQuestionIn(BaseModel):
    topic_id: Optional[str] = None
    topic_name: Optional[str] = None
    subject_name: Optional[str] = None
    difficulty: Optional[str] = "medium"


class AnalyzeIn(BaseModel):
    question: str
    student_answer: str
    correct_answer: Optional[str] = None


async def _build_context(user, subject_id=None, topic_id=None, lesson_id=None, problem=None):
    ctx = {"name": user.get("name"), "target_score": user.get("target_score")}
    idx = C.topic_index()
    if topic_id and topic_id in idx:
        ctx["topic_name"] = idx[topic_id]["name"]
        ctx["subject_name"] = idx[topic_id]["subject_name"]
        k = await db.knowledge.find_one({"user_id": user["id"], "topic_id": topic_id})
        if k:
            ctx["mastery"] = k.get("mastery")
    elif subject_id:
        s = await db.subjects.find_one({"id": subject_id})
        if s:
            ctx["subject_name"] = s["name"]
    if lesson_id:
        l = await db.lessons.find_one({"id": lesson_id})
        if l:
            ctx["lesson_title"] = l.get("title")
    if problem:
        ctx["problem"] = problem
    weak = await db.knowledge.find({"user_id": user["id"]}).sort("mastery", 1).to_list(3)
    ctx["weak_topics"] = [w["topic_name"] for w in weak if w.get("attempts", 0) > 0]
    return ctx


@router.get("/ai/status")
async def ai_status(user: dict = Depends(get_current_user)):
    return {"available": ai_available()}


@router.get("/ai/conversations")
async def conversations(user: dict = Depends(get_current_user)):
    # exclude per-lesson conversations (lesson_id null/missing matches general chats only)
    convs = clean_list(await db.ai_conversations.find(
        {"user_id": user["id"], "lesson_id": None}
    ).sort("updated_at", -1).to_list(50))
    return convs


@router.get("/ai/conversations/{conv_id}")
async def conversation_messages(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.ai_conversations.find_one({"id": conv_id, "user_id": user["id"]})
    if not conv:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    msgs = clean_list(await db.ai_messages.find(
        {"conversation_id": conv_id}).sort("created_at", 1).to_list(500))
    return {"conversation_id": conv_id, "messages": msgs}


@router.post("/ai/conversations/{conv_id}/clear")
async def clear_conversation(conv_id: str, user: dict = Depends(get_current_user)):
    await db.ai_messages.delete_many({"conversation_id": conv_id})
    await db.ai_conversations.delete_one({"id": conv_id, "user_id": user["id"]})
    return {"ok": True}


@router.post("/ai/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    _rate_limit(user["id"])
    conv_id = body.conversation_id
    if not conv_id:
        conv_id = new_id()
        await db.ai_conversations.insert_one({
            "id": conv_id, "user_id": user["id"],
            "title": body.message[:40], "subject_id": body.subject_id,
            "topic_id": body.topic_id, "created_at": now_iso(), "updated_at": now_iso(),
        })

    # store user message
    await db.ai_messages.insert_one({
        "id": new_id(), "conversation_id": conv_id, "role": "user",
        "content": body.message, "created_at": now_iso(),
    })

    history = clean_list(await db.ai_messages.find(
        {"conversation_id": conv_id}).sort("created_at", 1).to_list(20))
    context = await _build_context(user, body.subject_id, body.topic_id, body.lesson_id, body.problem)

    if not ai_available():
        answer = AI_UNAVAILABLE
    else:
        try:
            answer = await AIService.generate_answer(conv_id, body.message, context, history[:-1])
            if not answer:
                answer = AI_UNAVAILABLE
        except Exception:
            answer = AI_UNAVAILABLE

    await db.ai_messages.insert_one({
        "id": new_id(), "conversation_id": conv_id, "role": "assistant",
        "content": answer, "created_at": now_iso(),
    })
    await db.ai_conversations.update_one({"id": conv_id}, {"$set": {"updated_at": now_iso()}})

    return {"conversation_id": conv_id, "answer": answer, "available": ai_available()}


@router.post("/ai/explain")
async def explain(body: ExplainIn, user: dict = Depends(get_current_user)):
    _rate_limit(user["id"])
    idx = C.topic_index()
    topic_name = body.topic_name
    subject_name = body.subject_name
    mastery = None
    if body.topic_id and body.topic_id in idx:
        topic_name = idx[body.topic_id]["name"]
        subject_name = idx[body.topic_id]["subject_name"]
        k = await db.knowledge.find_one({"user_id": user["id"], "topic_id": body.topic_id})
        mastery = k.get("mastery") if k else None
    if not ai_available():
        return {"answer": AI_UNAVAILABLE, "available": False}
    try:
        answer = await AIService.explain_topic(new_id(), topic_name or "тема",
                                               subject_name or "предмет", mastery, body.mode)
        return {"answer": answer or AI_UNAVAILABLE, "available": True}
    except Exception:
        return {"answer": AI_UNAVAILABLE, "available": True}


@router.post("/ai/generate-question")
async def generate_question(body: GenQuestionIn, user: dict = Depends(get_current_user)):
    _rate_limit(user["id"])
    idx = C.topic_index()
    topic_name = body.topic_name
    subject_name = body.subject_name
    if body.topic_id and body.topic_id in idx:
        topic_name = idx[body.topic_id]["name"]
        subject_name = idx[body.topic_id]["subject_name"]
    if not ai_available():
        return {"question": None, "available": False, "message": AI_UNAVAILABLE}
    try:
        q = await AIService.generate_question(new_id(), topic_name or "тема",
                                              subject_name or "предмет", body.difficulty)
        if not q:
            return {"question": None, "available": True, "message": "Не удалось сгенерировать задание"}
        return {"question": q, "available": True, "generated": True}
    except Exception:
        return {"question": None, "available": True, "message": AI_UNAVAILABLE}


@router.post("/ai/analyze-answer")
async def analyze_answer(body: AnalyzeIn, user: dict = Depends(get_current_user)):
    _rate_limit(user["id"])
    if not ai_available():
        return {"answer": AI_UNAVAILABLE, "available": False}
    try:
        answer = await AIService.analyze_answer(new_id(), body.question,
                                                body.student_answer, body.correct_answer)
        return {"answer": answer or AI_UNAVAILABLE, "available": True}
    except Exception:
        return {"answer": AI_UNAVAILABLE, "available": True}
