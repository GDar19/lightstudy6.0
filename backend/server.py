from dotenv import load_dotenv
from pathlib import Path
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import client
from seed import run_seed
import routes_auth, routes_user, routes_content, routes_diagnostic
import routes_plan, routes_practice, routes_mistakes, routes_dashboard
import routes_ai, routes_mock, routes_admin, routes_kb

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lightstudy")

app = FastAPI(title="LightStudy API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "LightStudy API", "status": "ok"}


for module in [routes_auth, routes_user, routes_content, routes_diagnostic,
               routes_plan, routes_practice, routes_mistakes, routes_dashboard,
               routes_ai, routes_mock, routes_admin, routes_kb]:
    api_router.include_router(module.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await run_seed()
        logger.info("Seed completed")
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
