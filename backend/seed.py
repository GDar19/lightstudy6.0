"""Seed database with content and default accounts (idempotent)."""
import os
from datetime import datetime, timezone

from db import db
from auth_utils import hash_password, verify_password, new_id, now_iso
import content_data as C


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
    # Subjects
    for s in C.SUBJECTS:
        await db.subjects.update_one({"id": s["id"]}, {"$set": s}, upsert=True)

    # Questions (stable ids by content hash of subject+topic+question)
    existing = await db.questions.count_documents({})
    if existing == 0:
        docs = []
        for i, q in enumerate(C.QUESTIONS):
            doc = dict(q)
            doc["id"] = f"q_{q['subject_id']}_{q['topic_id']}_{i}"
            docs.append(doc)
        if docs:
            await db.questions.insert_many(docs)

    # Lessons
    if await db.lessons.count_documents({}) == 0:
        docs = []
        for i, l in enumerate(C.LESSONS):
            doc = dict(l)
            doc["id"] = f"l_{l['subject_id']}_{l['topic_id']}_{i}"
            docs.append(doc)
        if docs:
            await db.lessons.insert_many(docs)

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
