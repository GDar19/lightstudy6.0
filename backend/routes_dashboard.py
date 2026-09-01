from fastapi import APIRouter, Depends
from datetime import datetime, timezone, date
from db import db, clean, clean_list
from auth_utils import get_current_user
from logic import update_streak

router = APIRouter()


def _days_until(exam_date: str):
    if not exam_date:
        return None
    try:
        d = datetime.fromisoformat(exam_date).date()
        return max(0, (d - date.today()).days)
    except Exception:
        return None


async def _aggregate(user_id: str, subjects: list):
    knowledge = clean_list(await db.knowledge.find({"user_id": user_id}).to_list(500))
    total_attempts = await db.question_attempts.count_documents({"user_id": user_id})
    correct_attempts = await db.question_attempts.count_documents({"user_id": user_id, "is_correct": True})
    lessons_done = await db.lesson_completions.count_documents({"user_id": user_id})
    overall = round(sum(k["mastery"] for k in knowledge) / len(knowledge)) if knowledge else 0
    accuracy = round((correct_attempts / total_attempts) * 100) if total_attempts else 0
    return knowledge, total_attempts, lessons_done, overall, accuracy


@router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    streak = await update_streak(user)
    fresh = await db.users.find_one({"id": user["id"]})
    fresh.pop("_id", None); fresh.pop("password_hash", None)

    knowledge, total_attempts, lessons_done, overall, accuracy = await _aggregate(
        user["id"], fresh.get("subjects", []))

    # today's plan items
    today_str = date.today().isoformat()
    today_items = clean_list(await db.study_plan_items.find(
        {"user_id": user["id"], "date": {"$lte": today_str}, "status": "planned"}
    ).to_list(20))
    today_items = today_items[:5]

    # weak topics
    weak = sorted([k for k in knowledge if k.get("attempts", 0) > 0], key=lambda k: k["mastery"])[:4]

    subjects = clean_list(await db.subjects.find(
        {"id": {"$in": fresh.get("subjects", [])}}).to_list(50))
    for s in subjects:
        ks = [k for k in knowledge if k["subject_id"] == s["id"]]
        s["mastery"] = round(sum(k["mastery"] for k in ks) / len(ks)) if ks else 0

    return {
        "name": fresh.get("name"),
        "days_until_exam": _days_until(fresh.get("exam_date")),
        "exam_date": fresh.get("exam_date"),
        "target_score": fresh.get("target_score"),
        "overall_progress": overall,
        "tasks_completed": total_attempts,
        "lessons_completed": lessons_done,
        "streak": streak,
        "accuracy": accuracy,
        "onboarded": fresh.get("onboarded", False),
        "has_diagnostics": await db.diagnostics.count_documents({"user_id": user["id"], "status": "completed"}) > 0,
        "subjects": subjects,
        "today_tasks": today_items,
        "weak_topics": weak,
    }


@router.get("/statistics")
async def statistics(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]})
    knowledge, total_attempts, lessons_done, overall, accuracy = await _aggregate(
        user["id"], fresh.get("subjects", []))

    # subject mastery
    subjects = clean_list(await db.subjects.find(
        {"id": {"$in": fresh.get("subjects", [])}}).to_list(50))
    subject_mastery = []
    for s in subjects:
        ks = [k for k in knowledge if k["subject_id"] == s["id"]]
        subject_mastery.append({"subject": s["short"], "mastery": round(
            sum(k["mastery"] for k in ks) / len(ks)) if ks else 0, "color": s.get("color")})

    # progress over time: attempts grouped by day (accuracy)
    attempts = clean_list(await db.question_attempts.find(
        {"user_id": user["id"]}).sort("created_at", 1).to_list(1000))
    by_day = {}
    for a in attempts:
        day = (a.get("created_at") or "")[:10]
        d = by_day.setdefault(day, {"correct": 0, "total": 0})
        d["total"] += 1
        d["correct"] += 1 if a["is_correct"] else 0
    progress_over_time = [
        {"date": d, "accuracy": round((v["correct"] / v["total"]) * 100) if v["total"] else 0,
         "tasks": v["total"]}
        for d, v in sorted(by_day.items())
    ]

    topic_mastery = [{"topic": k["topic_name"], "mastery": k["mastery"], "subject": k["subject_name"]}
                     for k in sorted(knowledge, key=lambda x: x["mastery"], reverse=True)]

    return {
        "overall_mastery": overall,
        "accuracy": accuracy,
        "tasks_completed": total_attempts,
        "lessons_completed": lessons_done,
        "streak": fresh.get("streak", 0),
        "subject_mastery": subject_mastery,
        "topic_mastery": topic_mastery,
        "weak_topics": sorted([k for k in knowledge if k.get("attempts", 0) > 0],
                              key=lambda k: k["mastery"])[:5],
        "progress_over_time": progress_over_time,
    }


@router.get("/progress")
async def progress(user: dict = Depends(get_current_user)):
    knowledge = clean_list(await db.knowledge.find({"user_id": user["id"]}).to_list(500))
    return {"knowledge": knowledge}


@router.get("/achievements")
async def achievements(user: dict = Depends(get_current_user)):
    catalog = clean_list(await db.achievements.find({}).to_list(100))
    earned = clean_list(await db.user_achievements.find({"user_id": user["id"]}).to_list(100))
    earned_codes = {e["code"]: e for e in earned}
    result = []
    for c in catalog:
        e = earned_codes.get(c["code"])
        result.append({**c, "earned": bool(e), "earned_at": e.get("earned_at") if e else None})
    return result


@router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    notifs = clean_list(await db.notifications.find(
        {"user_id": user["id"]}).sort("created_at", -1).to_list(50))
    return notifs


@router.post("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}
