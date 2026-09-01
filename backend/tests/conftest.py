import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"


def _creds():
    p = Path("/app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8") if p.exists() else ""
    email = re.search(r'(?im)^\s*[-*]?\s*Email:\s*`?([^`\s]+)', content)
    password = re.search(r'(?im)^\s*[-*]?\s*Password:\s*`?([^`\s]+)', content)
    return {"email": email.group(1) if email else None,
            "password": password.group(1) if password else None}


@pytest.fixture(scope="session")
def admin_credentials():
    c = _creds()
    if not c["email"] or not c["password"]:
        pytest.skip("Missing admin credentials in /app/memory/test_credentials.md")
    return c


@pytest.fixture(scope="session")
def student():
    """Register a fresh student, return session (cookies) + token + user."""
    s = requests.Session()
    email = f"TEST_qa_{int(time.time())}@ls.ru"
    r = s.post(f"{API}/auth/register", json={"name": "TEST QA Student",
                                            "email": email, "password": "test123"})
    if r.status_code != 200:
        pytest.fail(f"Register failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return {"session": s, "token": data["token"], "user": data["user"],
            "email": email, "password": "test123", "register_response": r}


@pytest.fixture(scope="session")
def student2():
    s = requests.Session()
    email = f"TEST_qa2_{int(time.time())}@ls.ru"
    r = s.post(f"{API}/auth/register", json={"name": "TEST QA Other",
                                             "email": email, "password": "test123"})
    if r.status_code != 200:
        pytest.fail(f"Register(2) failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return {"session": s, "token": data["token"], "user": data["user"], "email": email}


@pytest.fixture(scope="session")
def admin(admin_credentials):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=admin_credentials)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    assert data["user"]["role"] == "admin"
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return {"session": s, "user": data["user"]}
