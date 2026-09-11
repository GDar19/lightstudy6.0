"""Sequential Curriculum Engine (layered on top of existing knowledge/questions/lessons).
Curriculum is the source of truth for topic ORDER and progression. Student results decide
how long each topic takes. No AI is used to choose topics.
Backward-compatible: reuses `knowledge` (extended with state/started_at/mastered_at/curriculum_id)
and `question_attempts`; existing progress is preserved (matched by subject_id + topic_id).
"""
from datetime import datetime, timezone, timedelta
from db import db, clean, clean_list
from auth_utils import new_id, now_iso
import content_data as C
from logic import compute_mastery

MASTERY_THRESHOLD = 80      # % required to master a topic
MIN_MASTERY_ATTEMPTS = 6    # minimum valid attempts before a topic can be mastered
DAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
ACTIVITY_DURATION = {"lesson": 20, "practice": 20, "test": 25, "review": 15, "mock_exam": 180}


# ---------------- seeding / migration ----------------
async def seed_curriculum():
    """Idempotent: build curriculum rows from content_data SUBJECTS with explicit order.
    Existing rows are not overwritten (admin edits preserved)."""
    for subj in C.SUBJECTS:
        order = 0
        for sec in subj.get("sections", []):
            for t in sec.get("topics", []):
                order += 1
                existing = await db.curriculum.find_one({"subject_id": subj["id"], "topic_id": t["id"]})
                if existing:
                    continue
                await db.curriculum.insert_one({
                    "id": new_id(), "subject_id": subj["id"], "section_id": sec["id"],
                    "topic_id": t["id"], "subtopic_id": None,
                    "title": t["name"], "description": "",
                    "order": order, "ege_task_numbers": [], "prerequisite_ids": [],
                    "is_active": True, "created_at": now_iso(),
                })


async def _curriculum_topics(subject_id: str):
    rows = clean_list(await db.curriculum.find({"subject_id": subject_id, "is_active": True}).to_list(500))
    return sorted(rows, key=lambda r: r.get("order", 0))


# ---------------- mastery gate ----------------
async def is_topic_mastered(user_id: str, topic_id: str) -> bool:
    attempts = await db.question_attempts.find(
        {"user_id": user_id, "topic_id": topic_id}).sort("created_at", -1).to_list(20)
    if len(attempts) < MIN_MASTERY_ATTEMPTS:
        return False
    records = [{"is_correct": a.get("is_correct"), "difficulty": a.get("difficulty", "medium")} for a in attempts]
    return compute_mastery(records) >= MASTERY_THRESHOLD


async def _topic_state(user_id: str, topic_id: str):
    """Return (state, mastery, attempts). state: not_started|learning|mastered."""
    k = await db.knowledge.find_one({"user_id": user_id, "topic_id": topic_id})
    attempts = k.get("attempts", 0) if k else 0
    mastery = k.get("mastery", 0) if k else 0
    if attempts == 0:
        return "not_started", mastery, 0
    if await is_topic_mastered(user_id, topic_id):
        return "mastered", mastery, attempts
    return "learning", mastery, attempts


async def _persist_state(user_id: str, subject_id: str, row: dict, state: str):
    """Write-through the derived state onto the knowledge profile (backward compatible)."""
    upd = {"$set": {"state": state, "curriculum_id": row["id"], "subject_id": subject_id}}
    k = await db.knowledge.find_one({"user_id": user_id, "topic_id": row["topic_id"]})
    if k:
        if state in ("learning", "mastered") and not k.get("started_at"):
            upd["$set"]["started_at"] = now_iso()
        if state == "mastered" and not k.get("mastered_at"):
            upd["$set"]["mastered_at"] = now_iso()
        await db.knowledge.update_one({"user_id": user_id, "topic_id": row["topic_id"]}, upd)


# ---------------- progression queries ----------------
async def subject_progress(user_id: str, subject_id: str) -> dict:
    topics = await _curriculum_topics(subject_id)
    total = len(topics)
    started = mastered = 0
    current = None
    detailed = []
    info = C.topic_index()
    for row in topics:
        state, mastery, attempts = await _topic_state(user_id, row["topic_id"])
        await _persist_state(user_id, subject_id, row, state)
        if state != "not_started":
            started += 1
        if state == "mastered":
            mastered += 1
        elif current is None:
            current = {"curriculum_id": row["id"], "topic_id": row["topic_id"],
                       "title": row["title"], "order": row["order"],
                       "mastery": mastery, "state": state, "attempts": attempts}
        detailed.append({"curriculum_id": row["id"], "topic_id": row["topic_id"], "title": row["title"],
                         "order": row["order"], "state": state, "mastery": mastery,
                         "locked": current is not None and (current["topic_id"] != row["topic_id"]) and state == "not_started"})
    # next available topic = first not_started after current
    nxt = None
    if current:
        after = [t for t in topics if t["order"] > current["order"]]
        if after:
            nxt = {"curriculum_id": after[0]["id"], "topic_id": after[0]["topic_id"], "title": after[0]["title"]}
    completed = total > 0 and mastered == total
    subj_name = C.subject_name(subject_id) if hasattr(C, "subject_name") else info.get(topics[0]["topic_id"], {}).get("subject_name", subject_id) if topics else subject_id
    return {
        "subject_id": subject_id, "subject_name": subj_name,
        "total_topics": total, "topics_started": started, "topics_mastered": mastered,
        "topics_remaining": total - mastered,
        "curriculum_progress": round((mastered / total) * 100, 1) if total else 0,
        "current_topic": current, "next_topic": nxt,
        "curriculum_completed": completed, "topics": detailed,
        "mastery_threshold": MASTERY_THRESHOLD,
    }


async def current_topic(user_id: str, subject_id: str):
    return (await subject_progress(user_id, subject_id)).get("current_topic")


async def next_topic(user_id: str, subject_id: str):
    return (await subject_progress(user_id, subject_id)).get("next_topic")


# ---------------- plan generation (curriculum-driven) ----------------
def _activities_for(state: str, mastery: int):
    """Decide the next activities for the CURRENT topic based on real mastery."""
    if state == "not_started":
        return ["lesson", "practice"], "high"
    # learning
    if mastery < 40:
        return ["lesson", "practice"], "high"
    if mastery < 65:
        return ["practice"], "high"
    # near threshold -> targeted practice + retest
    return ["practice", "test"], "medium"


async def generate_study_plan(user_id: str, user: dict):
    """Curriculum-driven weekly plan: for each subject take the FIRST non-mastered topic and
    schedule its next activities; subjects are interleaved but each keeps curriculum order.
    Preserves completed (done) items. No ranked[:14] cutoff — every topic is reached in turn."""
    subjects = user.get("subjects", [])
    if not subjects:
        return []

    # Build a per-subject queue of activity blocks for the current (and slightly ahead) topics
    per_subject_blocks = {}
    for sid in subjects:
        prog = await subject_progress(user_id, sid)
        blocks = []
        cur = prog.get("current_topic")
        if cur:
            acts, priority = _activities_for(cur["state"], cur["mastery"])
            row = await db.curriculum.find_one({"id": cur["curriculum_id"]})
            for act in acts:
                blocks.append({"subject_id": sid, "subject_name": prog["subject_name"],
                               "topic_id": cur["topic_id"], "topic_name": cur["title"],
                               "curriculum_id": cur["curriculum_id"], "activity_type": act,
                               "difficulty": (await _diff(user_id, cur["topic_id"])), "priority": priority})
            # one spaced review of the most recently mastered topic (does not block progression)
        elif prog.get("curriculum_completed"):
            # subject done: schedule a review of the last topic
            if prog["topics"]:
                last = prog["topics"][-1]
                blocks.append({"subject_id": sid, "subject_name": prog["subject_name"],
                               "topic_id": last["topic_id"], "topic_name": last["title"],
                               "curriculum_id": last["curriculum_id"], "activity_type": "review",
                               "difficulty": "hard", "priority": "low"})
        per_subject_blocks[sid] = blocks

    # Interleave subjects round-robin, preserving within-subject order
    ordered = []
    idx = 0
    while any(per_subject_blocks[s] for s in subjects):
        for s in subjects:
            if per_subject_blocks[s]:
                ordered.append(per_subject_blocks[s].pop(0))
        idx += 1
        if idx > 50:
            break

    # Preserve completed items; rebuild planned ones
    await db.study_plan_items.delete_many({"user_id": user_id, "status": {"$ne": "done"}})

    today = datetime.now(timezone.utc)
    items = []
    day_offset = 0
    per_day = 0
    max_per_day = 3
    for blk in ordered:
        if per_day >= max_per_day:
            day_offset += 1
            per_day = 0
        date = today + timedelta(days=day_offset)
        items.append({
            "id": new_id(), "user_id": user_id,
            "subject_id": blk["subject_id"], "subject_name": blk["subject_name"],
            "topic_id": blk["topic_id"], "topic_name": blk["topic_name"],
            "curriculum_id": blk.get("curriculum_id"),
            "activity_type": blk["activity_type"], "difficulty": blk["difficulty"],
            "priority": blk["priority"], "duration": ACTIVITY_DURATION.get(blk["activity_type"], 20),
            "status": "planned", "completion": 0,
            "day": DAYS_RU[date.weekday()], "date": date.date().isoformat(),
            "created_at": now_iso(),
        })
        per_day += 1

    if items:
        await db.study_plan_items.insert_many([dict(x) for x in items])
    await db.study_plans.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "generated_at": now_iso(), "item_count": len(items)}}, upsert=True)
    return items


async def _diff(user_id: str, topic_id: str) -> str:
    k = await db.knowledge.find_one({"user_id": user_id, "topic_id": topic_id})
    return (k or {}).get("difficulty", "medium")
