from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import db, clean, clean_list
from auth_utils import get_current_user, now_iso, new_id
from logic import grant_achievement, update_mastery
from grader import check_answer
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
