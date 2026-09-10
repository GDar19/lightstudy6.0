from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import db, clean, clean_list
from auth_utils import get_current_user, now_iso, new_id
from logic import grant_achievement, update_mastery
from grader import check_answer
from ai_service import AIService, ai_available
import content_data as C

router = APIRouter()


@router.get("/subjects")
async def list_subjects(user: dict = Depends(get_current_user)):
    subjects = clean_list(await db.subjects.find({"enabled": {"$ne": False}}).to_list(100))
    # attach user mastery per subject
    knowledge = clean_list(await db.knowledge.find({"user_id": user["id"]}).to_list(500))
    by_subject = {}
    for k in knowledge:
        by_subject.setdefault(k["subject_id"], []).append(k)
    for s in subjects:
        ks = by_subject.get(s["id"], [])
        s["mastery"] = round(sum(k["mastery"] for k in ks) / len(ks)) if ks else 0
        s["topics_started"] = len(ks)
        completed = await db.question_attempts.count_documents({"user_id": user["id"], "subject_id": s["id"]})
        s["completed_tasks"] = completed
        s["selected"] = s["id"] in user.get("subjects", [])
        # next recommended topic: lowest mastery among subject topics
        s["topic_count"] = sum(len(sec["topics"]) for sec in s["sections"])
        weak = sorted(ks, key=lambda x: x["mastery"])
        s["next_topic"] = weak[0]["topic_name"] if weak else (
            s["sections"][0]["topics"][0]["name"] if s["sections"] else None)
    return subjects


@router.get("/subjects/{subject_id}")
async def get_subject(subject_id: str, user: dict = Depends(get_current_user)):
    s = clean(await db.subjects.find_one({"id": subject_id}))
    if not s:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    knowledge = {k["topic_id"]: clean(k) for k in await db.knowledge.find(
        {"user_id": user["id"], "subject_id": subject_id}).to_list(200)}
    lessons = clean_list(await db.lessons.find({"subject_id": subject_id}).to_list(100))
    lessons_by_topic = {}
    for l in lessons:
        lessons_by_topic.setdefault(l["topic_id"], []).append(l)
    q_counts = {}
    async for q in db.questions.find({"subject_id": subject_id}, {"topic_id": 1}):
        q_counts[q["topic_id"]] = q_counts.get(q["topic_id"], 0) + 1
    for sec in s["sections"]:
        for t in sec["topics"]:
            k = knowledge.get(t["id"], {})
            t["mastery"] = k.get("mastery", 0)
            t["difficulty"] = k.get("difficulty", "medium")
            t["attempts"] = k.get("attempts", 0)
            t["has_lesson"] = t["id"] in lessons_by_topic
            t["question_count"] = q_counts.get(t["id"], 0)
    return s


@router.get("/topics/{topic_id}")
async def get_topic(topic_id: str, user: dict = Depends(get_current_user)):
    idx = C.topic_index()
    if topic_id not in idx:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    info = idx[topic_id]
    k = clean(await db.knowledge.find_one({"user_id": user["id"], "topic_id": topic_id})) or {}
    lessons = clean_list(await db.lessons.find({"topic_id": topic_id}).to_list(20))
    q_count = await db.questions.count_documents({"topic_id": topic_id})
    mistakes = clean_list(await db.mistakes.find(
        {"user_id": user["id"], "topic_id": topic_id}).sort("created_at", -1).to_list(5))
    return {
        "topic_id": topic_id, "name": info["name"], "subject_id": info["subject_id"],
        "subject_name": info["subject_name"], "section_name": info["section_name"],
        "mastery": k.get("mastery", 0), "difficulty": k.get("difficulty", "medium"),
        "attempts": k.get("attempts", 0), "trend": k.get("trend", "flat"),
        "lessons": lessons, "question_count": q_count, "recent_mistakes": mistakes,
    }


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    l = clean(await db.lessons.find_one({"id": lesson_id}))
    if not l:
        raise HTTPException(status_code=404, detail="Урок не найден")
    prog = clean(await db.lesson_progress.find_one({"user_id": user["id"], "lesson_id": lesson_id})) or {}
    l["prior_answers"] = prog.get("answers", {})
    l["status"] = prog.get("status", "not_started")
    return l


class LessonAnswerIn(BaseModel):
    task_index: int
    answer: object = None


@router.post("/lessons/{lesson_id}/task-answer")
async def lesson_task_answer(lesson_id: str, body: LessonAnswerIn, user: dict = Depends(get_current_user)):
    l = clean(await db.lessons.find_one({"id": lesson_id}))
    if not l:
        raise HTTPException(status_code=404, detail="Урок не найден")
    tasks = l.get("interactive_tasks", [])
    if body.task_index < 0 or body.task_index >= len(tasks):
        raise HTTPException(status_code=404, detail="Задание не найдено")
    task = tasks[body.task_index]
    is_correct = check_answer(task, body.answer)

    # persist answer + mark lesson in progress
    await db.lesson_progress.update_one(
        {"user_id": user["id"], "lesson_id": lesson_id},
        {"$setOnInsert": {"id": new_id(), "started_at": now_iso()},
         "$set": {f"answers.{body.task_index}": {"answer": body.answer, "is_correct": is_correct},
                  "status": "in_progress", "subject_id": l["subject_id"], "topic_id": l["topic_id"]}},
        upsert=True,
    )
    # feed lesson practice into mastery (medium difficulty)
    await db.question_attempts.insert_one({
        "id": new_id(), "user_id": user["id"], "question_id": f"{lesson_id}#{body.task_index}",
        "subject_id": l["subject_id"], "topic_id": l["topic_id"],
        "answer": body.answer, "is_correct": is_correct, "difficulty": task.get("difficulty", "medium"),
        "created_at": now_iso(), "source": "lesson",
    })
    await update_mastery(user["id"], l["subject_id"], l["topic_id"], is_correct, task.get("difficulty", "medium"))
    return {"is_correct": is_correct, "correct_answer": task.get("answer"),
            "correct_value": task.get("answer_value"), "type": task.get("type", "single_choice"),
            "explanation": task.get("explanation", ""), "hint": task.get("hint", "")}


AI_UNAVAILABLE = "ИИ-помощник временно недоступен. Попробуй ещё раз."


class LessonChatIn(BaseModel):
    message: str
    task_index: Optional[int] = None


def _lesson_context(lesson, task_index, prior_answers, info):
    parts = [f"Урок: {lesson.get('title')}",
             f"Предмет: {info.get('subject_name', lesson.get('subject_id'))}",
             f"Тема: {info.get('name', lesson.get('topic_id'))}"]
    if lesson.get("explanation"):
        parts.append(f"Теория урока: {lesson['explanation']}")
    if lesson.get("key_points"):
        parts.append("Ключевые моменты: " + "; ".join(lesson["key_points"]))
    tasks = lesson.get("interactive_tasks", [])
    if task_index is not None and 0 <= task_index < len(tasks):
        t = tasks[task_index]
        parts.append(f"Текущее задание: {t.get('prompt')}")
        if t.get("options"):
            parts.append("Варианты ответа: " + "; ".join(f"{chr(1040 + i)}) {o}" for i, o in enumerate(t["options"])))
        if t.get("type") in ("numeric", "text"):
            ca = t.get("answer_value")
        else:
            ca = t["options"][t["answer"]] if t.get("options") and t.get("answer") is not None else t.get("answer")
        parts.append(f"Правильный ответ (для тебя, НЕ раскрывай сразу — сначала подсказки): {ca}")
        if t.get("explanation"):
            parts.append(f"Объяснение задания: {t['explanation']}")
        pa = (prior_answers or {}).get(str(task_index)) or (prior_answers or {}).get(task_index)
        if pa is not None:
            parts.append(f"Ответ ученика на это задание: «{pa.get('answer')}» ({'верно' if pa.get('is_correct') else 'неверно'})")
    return "\n".join(parts)


@router.get("/lessons/{lesson_id}/chat")
async def get_lesson_chat(lesson_id: str, user: dict = Depends(get_current_user)):
    conv = await db.ai_conversations.find_one({"user_id": user["id"], "lesson_id": lesson_id})
    if not conv:
        return {"conversation_id": None, "messages": []}
    msgs = clean_list(await db.ai_messages.find({"conversation_id": conv["id"]}).sort("created_at", 1).to_list(500))
    return {"conversation_id": conv["id"], "messages": msgs}


@router.post("/lessons/{lesson_id}/chat")
async def lesson_chat(lesson_id: str, body: LessonChatIn, user: dict = Depends(get_current_user)):
    l = clean(await db.lessons.find_one({"id": lesson_id}))
    if not l:
        raise HTTPException(status_code=404, detail="Урок не найден")
    conv = await db.ai_conversations.find_one({"user_id": user["id"], "lesson_id": lesson_id})
    if not conv:
        conv_id = new_id()
        await db.ai_conversations.insert_one({
            "id": conv_id, "user_id": user["id"], "lesson_id": lesson_id,
            "title": f"Урок: {l.get('title')}", "subject_id": l["subject_id"],
            "topic_id": l["topic_id"], "created_at": now_iso(), "updated_at": now_iso(),
        })
    else:
        conv_id = conv["id"]

    await db.ai_messages.insert_one({
        "id": new_id(), "conversation_id": conv_id, "role": "user",
        "content": body.message, "created_at": now_iso(),
    })
    history = clean_list(await db.ai_messages.find({"conversation_id": conv_id}).sort("created_at", 1).to_list(20))

    prog = await db.lesson_progress.find_one({"user_id": user["id"], "lesson_id": lesson_id})
    info = C.topic_index().get(l["topic_id"], {})
    k = await db.knowledge.find_one({"user_id": user["id"], "topic_id": l["topic_id"]})
    problem = _lesson_context(l, body.task_index, (prog or {}).get("answers"), info)
    images = []
    try:
        import kb_service
        mm = await kb_service.retrieve_multimodal(l["subject_id"], f"{info.get('name','')} {body.message}", k=2, max_images=2)
        material, _ = kb_service.build_rag_context(mm["snippets"], mm["figures"])
        images = mm["images_b64"]
        if material:
            problem += "\n\n" + material
    except Exception:
        images = []
    context = {
        "name": user.get("name"), "subject_name": info.get("subject_name"),
        "topic_name": info.get("name"), "lesson_title": l.get("title"),
        "mastery": (k or {}).get("mastery"), "problem": problem,
    }

    if not ai_available():
        answer = AI_UNAVAILABLE
    else:
        try:
            answer = await AIService.generate_answer(conv_id, body.message, context, history[:-1], images=images) or AI_UNAVAILABLE
        except Exception:
            answer = AI_UNAVAILABLE

    await db.ai_messages.insert_one({
        "id": new_id(), "conversation_id": conv_id, "role": "assistant",
        "content": answer, "created_at": now_iso(),
    })
    await db.ai_conversations.update_one({"id": conv_id}, {"$set": {"updated_at": now_iso()}})
    return {"conversation_id": conv_id, "answer": answer, "available": ai_available()}


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    l = clean(await db.lessons.find_one({"id": lesson_id}))
    if not l:
        raise HTTPException(status_code=404, detail="Урок не найден")
    await db.lesson_completions.update_one(
        {"user_id": user["id"], "lesson_id": lesson_id},
        {"$set": {"user_id": user["id"], "lesson_id": lesson_id,
                  "subject_id": l["subject_id"], "topic_id": l["topic_id"],
                  "completed_at": now_iso()}},
        upsert=True,
    )
    await grant_achievement(user["id"], "first_lesson")
    await db.lesson_progress.update_one(
        {"user_id": user["id"], "lesson_id": lesson_id},
        {"$setOnInsert": {"id": new_id(), "started_at": now_iso()},
         "$set": {"status": "completed", "subject_id": l["subject_id"], "topic_id": l["topic_id"],
                  "completed_at": now_iso()}},
        upsert=True,
    )
    # mark matching plan item done
    await db.study_plan_items.update_many(
        {"user_id": user["id"], "topic_id": l["topic_id"], "activity_type": "lesson", "status": "planned"},
        {"$set": {"status": "done", "completion": 100}},
    )
    return {"ok": True}


@router.get("/textbooks")
async def list_textbooks(user: dict = Depends(get_current_user)):
    books = clean_list(await db.textbooks.find({}).to_list(100))
    idx = C.topic_index()
    for b in books:
        b["topic_names"] = [idx.get(t, {}).get("name", t) for t in b.get("topics", [])]
    return books
