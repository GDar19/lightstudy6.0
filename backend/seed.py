"""Seed database with content and default accounts (idempotent)."""
import os
from datetime import datetime, timezone

from db import db, clean_list
from auth_utils import hash_password, verify_password, new_id, now_iso
import content_data as C
import content_extra as E
from grader import DIFFICULTY_LEVEL


def _normalize_question(doc: dict) -> dict:
    doc.setdefault("type", "single_choice")
    doc.setdefault("hint", "")
    doc.setdefault("exam_part", "")
    doc.setdefault("tags", [])
    doc.setdefault("answer_value", None)
    doc.setdefault("subtopic_id", None)
    doc.setdefault("status", "published")   # seed/admin content is published by default
    doc.setdefault("verified", True)
    doc.setdefault("ai_generated", False)
    doc["difficulty_level"] = DIFFICULTY_LEVEL.get(doc.get("difficulty", "medium"), 3)
    return doc


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.questions.create_index([("subject_id", 1), ("topic_id", 1)])
    await db.questions.create_index("id", unique=True)
    await db.knowledge.create_index([("user_id", 1), ("subject_id", 1)])
    await db.question_attempts.create_index([("user_id", 1), ("topic_id", 1)])
    await db.mistakes.create_index([("user_id", 1)])
    await db.study_plan_items.create_index([("user_id", 1)])
    await db.ai_messages.create_index([("conversation_id", 1)])
    await db.notifications.create_index([("user_id", 1)])


async def seed_content():
    # Subjects (core) — ensure enabled + exam_type defaults
    for s in C.SUBJECTS:
        s.setdefault("enabled", True)
        s.setdefault("exam_type", "По выбору")
        await db.subjects.update_one({"id": s["id"]}, {"$set": s}, upsert=True)
    # Mark obligatory subjects
    await db.subjects.update_one({"id": "rus"}, {"$set": {"exam_type": "Обязательный"}})
    await db.subjects.update_one({"id": "math_prof"}, {"$set": {"exam_type": "Обязательный"}})

    # Extra EGE subjects
    for s in E.EXTRA_SUBJECTS:
        await db.subjects.update_one({"id": s["id"]}, {"$set": s}, upsert=True)

    # Core questions — idempotent upsert by stable id (adds new topics like stereometry
    # without touching existing docs or student data)
    for i, qd in enumerate(C.QUESTIONS):
        doc = _normalize_question(dict(qd))
        doc["id"] = f"q_{qd['subject_id']}_{qd['topic_id']}_{i}"
        await db.questions.update_one(
            {"id": doc["id"]},
            {"$set": {k: v for k, v in doc.items() if k not in ("status", "verified")},
             "$setOnInsert": {"status": "published", "verified": True}},
            upsert=True,
        )
    # backfill schema fields on any legacy questions missing type
    async for existing in db.questions.find({"type": {"$exists": False}}):
        await db.questions.update_one({"id": existing["id"]}, {"$set": _normalize_question({
            "difficulty": existing.get("difficulty", "medium")})})

    # One-time status migration: AI-generated bank tasks are archived (hidden from students);
    # everything else defaults to published so existing content keeps working.
    await db.questions.update_many(
        {"status": {"$exists": False}, "ai_generated": True}, {"$set": {"status": "archived"}})
    await db.questions.update_many(
        {"status": {"$exists": False}}, {"$set": {"status": "published", "verified": True}})

    # Hard EGE questions — rebuild from source each startup (keeps content authoritative, no orphans)
    await db.questions.delete_many({"source": "LightStudy EGE"})
    hq_docs = []
    for i, qd in enumerate(E.HARD_QUESTIONS):
        doc = _normalize_question(dict(qd))
        doc["id"] = f"hq_{qd['subject_id']}_{qd['topic_id']}_{i}"
        hq_docs.append(doc)
    if hq_docs:
        await db.questions.insert_many(hq_docs)

    # Lessons
    if await db.lessons.count_documents({}) == 0:
        docs = []
        for i, l in enumerate(C.LESSONS):
            doc = dict(l)
            doc["id"] = f"l_{l['subject_id']}_{l['topic_id']}_{i}"
            doc["interactive_tasks"] = E.INTERACTIVE_TASKS.get(l["topic_id"], [])
            docs.append(doc)
        if docs:
            await db.lessons.insert_many(docs)
    else:
        # attach/refresh interactive tasks on existing lessons
        for topic_id, tasks in E.INTERACTIVE_TASKS.items():
            await db.lessons.update_many({"topic_id": topic_id}, {"$set": {"interactive_tasks": tasks}})

    # Ensure EVERY topic has at least one lesson so any plan "Урок" activity can open a real
    # lesson via the existing lesson system. Auto-built lessons reuse real published bank questions.
    idx = C.topic_index()
    for tid, info in idx.items():
        if await db.lessons.count_documents({"topic_id": tid}) > 0:
            continue
        bank = clean_list(await db.questions.find(
            {"topic_id": tid, "status": "published", "type": "single_choice"}).to_list(6))
        key_points = [q["explanation"] for q in bank if q.get("explanation")][:4]
        mini = [{"question": q["question"], "options": q.get("options", []), "answer": q.get("answer", 0)}
                for q in bank if q.get("options")][:3]
        lesson = {
            "id": f"l_{info['subject_id']}_{tid}_0",
            "subject_id": info["subject_id"], "topic_id": tid,
            "title": info["name"],
            "duration": 15, "difficulty": "medium",
            "explanation": f"Тема «{info['name']}» по предмету «{info['subject_name']}». "
                           "Изучи ключевые идеи ниже, затем реши задания. Если что-то непонятно — нажми «Фили объяснит».",
            "key_points": key_points, "formulas": [], "examples": [],
            "mini_questions": mini, "interactive_tasks": E.INTERACTIVE_TASKS.get(tid, []),
        }
        await db.lessons.insert_one(lesson)

    # Textbooks
    for i, t in enumerate(C.TEXTBOOKS):
        doc = dict(t)
        doc["id"] = f"tb_{t['subject_id']}"
        await db.textbooks.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)

    # Achievements catalog
    for a in C.ACHIEVEMENTS:
        await db.achievements.update_one({"code": a["code"]}, {"$set": a}, upsert=True)


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@lightstudy.ru").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Администратор",
            "role": "admin",
            "onboarded": True,
            "subjects": [],
            "created_at": now_iso(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})


async def run_seed():
    await ensure_indexes()
    await seed_content()
    await seed_admin()
