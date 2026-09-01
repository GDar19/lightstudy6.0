from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone, timedelta

from db import db
from auth_utils import (hash_password, verify_password, create_access_token,
                        create_refresh_token, set_auth_cookies, clear_auth_cookies,
                        get_current_user, new_id, now_iso, get_jwt_secret, JWT_ALGORITHM)
import jwt

router = APIRouter()

MAX_FAILED = 5
LOCKOUT_MINUTES = 15


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def public_user(u: dict) -> dict:
    u = dict(u)
    u.pop("_id", None)
    u.pop("password_hash", None)
    return u


@router.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    uid = new_id()
    doc = {
        "id": uid, "email": email, "password_hash": hash_password(body.password),
        "name": body.name, "role": "student", "onboarded": False,
        "subjects": [], "target_score": None, "exam_date": None,
        "daily_minutes": 60, "study_days": [], "confidence": None,
        "streak": 0, "last_active_date": None,
        "notifications_enabled": True, "created_at": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(doc), "token": access}


@router.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    # brute-force lockout
    locked_until = user.get("lockout_until")
    if locked_until:
        lu = datetime.fromisoformat(locked_until)
        if lu > datetime.now(timezone.utc):
            mins = int((lu - datetime.now(timezone.utc)).total_seconds() // 60) + 1
            raise HTTPException(status_code=429, detail=f"Слишком много попыток. Повтори через {mins} мин.")

    if not verify_password(body.password, user.get("password_hash", "")):
        failed = user.get("failed_attempts", 0) + 1
        update = {"failed_attempts": failed}
        if failed >= MAX_FAILED:
            update["lockout_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            update["failed_attempts"] = 0
            await db.users.update_one({"email": email}, {"$set": update})
            raise HTTPException(status_code=429, detail=f"Слишком много попыток. Повтори через {LOCKOUT_MINUTES} мин.")
        await db.users.update_one({"email": email}, {"$set": update})
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    await db.users.update_one({"email": email}, {"$set": {"failed_attempts": 0, "lockout_until": None}})
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "token": access}


@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Нет токена обновления")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Неверный токен")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    access = create_access_token(user["id"], user["email"])
    new_refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, new_refresh)
    return {"user": public_user(user), "token": access}


@router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)
