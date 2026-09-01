"""Deterministic learning logic: mastery scoring, adaptive difficulty, plan generation.
Kept transparent — no AI is used for numeric computations.
"""
from datetime import datetime, timezone, timedelta
from db import db, clean
from auth_utils import new_id, now_iso
import content_data as C
from grader import DIFFICULTY_WEIGHT, DIFFICULTY_CEILING

DIFFICULTY_ORDER = ["easy", "medium", "hard", "ege"]
TOPIC_IDX = C.topic_index()


def next_difficulty(current: str, accuracy: float) -> str:
    i = DIFFICULTY_ORDER.index(current) if current in DIFFICULTY_ORDER else 1
    if accuracy < 0.5 and i > 0:
        i -= 1
    elif accuracy > 0.75 and i < len(DIFFICULTY_ORDER) - 1:
        i += 1
    return DIFFICULTY_ORDER[i]


def compute_mastery(records):
    """records: list of dicts with keys is_correct, difficulty. Returns 0-100.
    Weighted by difficulty, capped by a ceiling based on the hardest attempted level,
    and scaled by a volume factor so a topic is not 'mastered' after a couple of items."""
    if not records:
        return 0
    total_w = sum(DIFFICULTY_WEIGHT.get(r.get("difficulty", "medium"), 2) for r in records)
    correct_w = sum(DIFFICULTY_WEIGHT.get(r.get("difficulty", "medium"), 2) for r in records if r.get("is_correct"))
    weighted_acc = (correct_w / total_w) if total_w else 0
    ceiling = max(DIFFICULTY_CEILING.get(r.get("difficulty", "medium"), 70) for r in records)
    volume = min(1.0, len(records) / 8.0)
    raw = min(ceiling, weighted_acc * 100)
    return max(0, min(100, round(raw * (0.4 + 0.6 * volume))))


async def get_or_create_knowledge(user_id: str, subject_id: str, topic_id: str) -> dict:
    doc = await db.knowledge.find_one({"user_id": user_id, "topic_id": topic_id})
    if doc:
        return clean(doc)
    info = TOPIC_IDX.get(topic_id, {})
    doc = {
        "id": new_id(),
        "user_id": user_id,
        "subject_id": subject_id,
        "topic_id": topic_id,
        "topic_name": info.get("name", topic_id),
        "subject_name": info.get("subject_name", subject_id),
        "mastery": 0,
        "confidence": 0,
        "attempts": 0,
        "correct": 0,
        "incorrect": 0,
        "difficulty": "medium",
        "trend": "flat",
        "last_practiced": None,
    }
    await db.knowledge.insert_one(dict(doc))
    return clean(doc)


async def update_mastery(user_id: str, subject_id: str, topic_id: str, is_correct: bool, difficulty: str = "medium"):
    """Update knowledge profile after a single answer (difficulty-weighted, volume-scaled)."""
    k = await get_or_create_knowledge(user_id, subject_id, topic_id)
    prev_mastery = k["mastery"]
    attempts = k["attempts"] + 1
    correct = k["correct"] + (1 if is_correct else 0)
    incorrect = k["incorrect"] + (0 if is_correct else 1)

    # window of recent attempts for this topic (already stored) + current
    recent = await db.question_attempts.find(
        {"user_id": user_id, "topic_id": topic_id}
    ).sort("created_at", -1).to_list(12)
    records = [{"is_correct": r.get("is_correct"), "difficulty": r.get("difficulty", "medium")} for r in recent]
    records.append({"is_correct": is_correct, "difficulty": difficulty})

    mastery = compute_mastery(records)
    simple_acc = sum(1 for r in records if r["is_correct"]) / len(records)

    trend = "up" if mastery > prev_mastery else ("down" if mastery < prev_mastery else "flat")
    difficulty_next = next_difficulty(k["difficulty"], simple_acc)
    confidence = min(100, attempts * 8)

    await db.knowledge.update_one(
        {"user_id": user_id, "topic_id": topic_id},
        {"$set": {
            "mastery": mastery, "attempts": attempts, "correct": correct,
            "incorrect": incorrect, "difficulty": difficulty_next, "trend": trend,
            "confidence": confidence, "last_practiced": now_iso(),
            "subject_id": subject_id,
        }},
    )
    return mastery, difficulty_next


async def build_knowledge_from_diagnostic(user_id: str, subject_id: str, per_topic: dict):
    """per_topic: {topic_id: {'records': [{'is_correct','difficulty'}], 'correct', 'total'}}"""
    for topic_id, stat in per_topic.items():
        records = stat.get("records", [])
        total = stat.get("total", len(records))
        correct = stat.get("correct", sum(1 for r in records if r.get("is_correct")))
        mastery = compute_mastery(records)
        info = TOPIC_IDX.get(topic_id, {})
        difficulty = "easy" if mastery < 50 else ("medium" if mastery < 75 else "hard")
        await db.knowledge.update_one(
            {"user_id": user_id, "topic_id": topic_id},
            {"$set": {
                "id": new_id(), "user_id": user_id, "subject_id": subject_id,
                "topic_id": topic_id, "topic_name": info.get("name", topic_id),
                "subject_name": info.get("subject_name", subject_id),
                "mastery": mastery, "attempts": total, "correct": correct,
                "incorrect": total - correct, "difficulty": difficulty,
                "trend": "flat", "confidence": min(100, total * 12),
                "last_practiced": now_iso(),
            }},
            upsert=True,
        )


DAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
ACTIVITY_DURATION = {"lesson": 20, "practice": 20, "test": 25, "review": 15, "mock_exam": 180}


async def generate_study_plan(user_id: str, user: dict):
    """Generate a personalized weekly plan from mastery + weak topics. Preserves completed items."""
    subjects = user.get("subjects", [])
    if not subjects:
        return []

    # Gather knowledge for user's subjects, ranked by weakness (low mastery first)
    knowledge = await db.knowledge.find({"user_id": user_id, "subject_id": {"$in": subjects}}).to_list(500)
    knowledge = [clean(k) for k in knowledge]

    # If no knowledge yet, seed topics from content for chosen subjects
    if not knowledge:
        for tid, info in TOPIC_IDX.items():
            if info["subject_id"] in subjects:
                knowledge.append({"topic_id": tid, "subject_id": info["subject_id"],
                                  "topic_name": info["name"], "subject_name": info["subject_name"],
                                  "mastery": 0, "difficulty": "medium"})

    # priority: weaker topics first
    ranked = sorted(knowledge, key=lambda k: k.get("mastery", 0))

    # Preserve completed items, drop only planned/future ones
    await db.study_plan_items.delete_many({"user_id": user_id, "status": {"$ne": "done"}})

    today = datetime.now(timezone.utc)
    items = []
    day_offset = 0
    per_day = 0
    max_per_day = 3
    activity_cycle = ["lesson", "practice", "review"]

    for i, k in enumerate(ranked[:14]):
        mastery = k.get("mastery", 0)
        # weak topics get lesson+practice, strong get review
        if mastery < 60:
            activities = ["lesson", "practice"]
            priority = "high"
        elif mastery < 80:
            activities = ["practice"]
            priority = "medium"
        else:
            activities = ["review"]
            priority = "low"

        for act in activities:
            if per_day >= max_per_day:
                day_offset += 1
                per_day = 0
            date = today + timedelta(days=day_offset)
            difficulty = k.get("difficulty", "medium")
            item = {
                "id": new_id(), "user_id": user_id,
                "subject_id": k["subject_id"], "subject_name": k.get("subject_name", ""),
                "topic_id": k["topic_id"], "topic_name": k.get("topic_name", ""),
                "activity_type": act, "difficulty": difficulty, "priority": priority,
                "duration": ACTIVITY_DURATION.get(act, 20),
                "status": "planned", "completion": 0,
                "day": DAYS_RU[date.weekday()],
                "date": date.date().isoformat(),
                "created_at": now_iso(),
            }
            items.append(item)
            per_day += 1

    if items:
        await db.study_plan_items.insert_many([dict(x) for x in items])

    await db.study_plans.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "generated_at": now_iso(), "item_count": len(items)}},
        upsert=True,
    )
    return items


async def grant_achievement(user_id: str, code: str):
    exists = await db.user_achievements.find_one({"user_id": user_id, "code": code})
    if exists:
        return
    cat = await db.achievements.find_one({"code": code})
    if not cat:
        return
    await db.user_achievements.insert_one({
        "id": new_id(), "user_id": user_id, "code": code,
        "title": cat["title"], "description": cat["description"], "icon": cat["icon"],
        "earned_at": now_iso(),
    })
    await add_notification(user_id, "achievement", f"Новое достижение: {cat['title']}")


async def add_notification(user_id: str, ntype: str, text: str):
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "type": ntype,
        "text": text, "read": False, "created_at": now_iso(),
    })


async def check_task_achievements(user_id: str):
    total = await db.question_attempts.count_documents({"user_id": user_id})
    if total >= 10:
        await grant_achievement(user_id, "tasks_10")
    if total >= 50:
        await grant_achievement(user_id, "tasks_50")


async def update_streak(user: dict):
    """Update login/activity streak based on last active date."""
    uid = user["id"]
    today = datetime.now(timezone.utc).date()
    fresh = await db.users.find_one({"id": uid})
    last = fresh.get("last_active_date")
    streak = fresh.get("streak", 0)
    if last:
        last_date = datetime.fromisoformat(last).date() if isinstance(last, str) else last
        delta = (today - last_date).days
        if delta == 0:
            return streak
        elif delta == 1:
            streak += 1
        else:
            streak = 1
    else:
        streak = 1
    await db.users.update_one({"id": uid}, {"$set": {"streak": streak, "last_active_date": today.isoformat()}})
    if streak >= 7:
        await grant_achievement(uid, "streak_7")
    return streak
