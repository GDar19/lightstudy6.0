from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional

from db import db
from auth_utils import get_current_user, now_iso
from logic import generate_study_plan

router = APIRouter()


class OnboardingIn(BaseModel):
    subjects: List[str]
    subject_count: Optional[int] = None
    target_score: Optional[int] = None
    exam_date: Optional[str] = None
    daily_minutes: Optional[int] = 60
    study_days: Optional[List[str]] = []
    confidence: Optional[str] = None


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    target_score: Optional[int] = None
    exam_date: Optional[str] = None
    subjects: Optional[List[str]] = None
    daily_minutes: Optional[int] = None
    study_days: Optional[List[str]] = None
    notifications_enabled: Optional[bool] = None


@router.post("/onboarding")
async def save_onboarding(body: OnboardingIn, user: dict = Depends(get_current_user)):
    update = {
        "subjects": body.subjects,
        "subject_count": body.subject_count or len(body.subjects),
        "target_score": body.target_score,
        "exam_date": body.exam_date,
        "daily_minutes": body.daily_minutes or 60,
        "study_days": body.study_days or [],
        "confidence": body.confidence,
        "onboarded": True,
        "updated_at": now_iso(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    fresh.pop("_id", None)
    fresh.pop("password_hash", None)
    return fresh


@router.patch("/profile")
async def update_profile(body: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    subjects_changed = "subjects" in update and set(update["subjects"]) != set(user.get("subjects", []))
    if update:
        update["updated_at"] = now_iso()
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    fresh.pop("_id", None)
    fresh.pop("password_hash", None)
    if subjects_changed:
        await generate_study_plan(user["id"], fresh)
    return fresh
