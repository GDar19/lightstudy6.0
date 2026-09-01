from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from db import db, clean, clean_list
from auth_utils import get_current_user
from logic import generate_study_plan

router = APIRouter()


class PlanItemPatch(BaseModel):
    status: Optional[str] = None
    completion: Optional[int] = None


@router.get("/study-plan")
async def get_plan(user: dict = Depends(get_current_user)):
    items = clean_list(await db.study_plan_items.find({"user_id": user["id"]}).to_list(500))
    plan = clean(await db.study_plans.find_one({"user_id": user["id"]}))
    # group by day
    by_day = {}
    for it in items:
        by_day.setdefault(it.get("date"), []).append(it)
    return {"items": items, "generated_at": plan.get("generated_at") if plan else None,
            "has_plan": bool(items)}


@router.post("/study-plan/generate")
async def gen_plan(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]})
    fresh.pop("_id", None)
    if not fresh.get("subjects"):
        raise HTTPException(status_code=400, detail="Сначала выбери предметы")
    items = await generate_study_plan(user["id"], fresh)
    return {"items": items, "count": len(items)}


@router.patch("/study-plan/items/{item_id}")
async def patch_item(item_id: str, body: PlanItemPatch, user: dict = Depends(get_current_user)):
    item = await db.study_plan_items.find_one({"id": item_id, "user_id": user["id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Задание плана не найдено")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.study_plan_items.update_one({"id": item_id}, {"$set": update})
    return clean(await db.study_plan_items.find_one({"id": item_id}))
