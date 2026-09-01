"""Playbook auth checks + Knowledge Base (RAG) API regression tests.

Modules covered:
- auth: bcrypt hash format, httpOnly cookies on login, brute-force lockout, seed_admin idempotency
- kb: upload -> index -> search -> reprocess -> delete lifecycle via /api/admin/kb/*
"""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base.rstrip("/")

ADMIN = {"email": "admin@lightstudy.ru", "password": "admin123"}
PDF_PATH = "/app/test_reports/sample_derivative_ru.pdf"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return s


# --- auth playbook ---
class TestAuthPlaybook:
    def test_bcrypt_hash_format_in_db(self):
        from pymongo import MongoClient
        env = dotenv_values("/app/backend/.env")
        db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        user = db.users.find_one({"email": ADMIN["email"]})
        assert user, "admin user not seeded"
        assert user["password_hash"].startswith("$2b$"), f"unexpected hash prefix: {user['password_hash'][:4]}"

    def test_login_sets_httponly_cookies(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200
        raw = r.headers.get("set-cookie", "") + " ".join(
            v for k, v in r.raw.headers.items() if k.lower() == "set-cookie")
        assert "access_token" in raw and "refresh_token" in raw, raw[:300]
        assert "HttpOnly" in raw, raw[:300]
        # /api/auth/me works with cookie only (no Bearer)
        me = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN["email"]
        assert me.json()["role"] == "admin"

    def test_cors_allows_credentials_with_origin(self):
        r = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={"Origin": "https://evil.example.com",
                     "Access-Control-Request-Method": "POST"}, timeout=30)
        allow_origin = r.headers.get("access-control-allow-origin")
        allow_creds = r.headers.get("access-control-allow-credentials")
        print(f"CORS allow-origin={allow_origin} allow-credentials={allow_creds}")
        assert allow_creds == "true"
        # NOTE: server uses allow_origin_regex='.*' -> reflects ANY origin (security finding)
        assert allow_origin is not None

    def test_bruteforce_lockout_after_5_failures(self):
        email = "TEST_lockout_probe@example.com"
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "goodpass123", "name": "TEST Lockout"}, timeout=30)
        assert reg.status_code in (200, 201, 400, 409), reg.text[:200]
        codes = []
        for _ in range(6):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "wrongpass"}, timeout=30)
            codes.append(r.status_code)
        print("failed login codes:", codes)
        after = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "goodpass123"}, timeout=30)
        print("correct-password status after 6 failures:", after.status_code, after.text[:200])
        assert after.status_code != 200, "account not locked after 5+ failed attempts"

    def test_seed_admin_password_still_valid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200, "seeded admin credentials rejected"


# --- knowledge base (RAG) ---
class TestKnowledgeBase:
    doc_id = None

    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/kb", timeout=30)
        assert r.status_code in (401, 403), r.status_code

    def test_rejects_non_pdf(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/kb/upload",
                              files={"file": ("note.txt", b"hello", "text/plain")},
                              data={"title": "TEST_bad", "doc_type": "textbook"}, timeout=60)
        assert r.status_code == 400, r.status_code

    def test_upload_index_search_reprocess_delete(self, admin_client):
        with open(PDF_PATH, "rb") as fh:
            r = admin_client.post(
                f"{BASE_URL}/api/admin/kb/upload",
                files={"file": ("sample_derivative_ru.pdf", fh, "application/pdf")},
                data={"title": "TEST_API_Производная", "subject_id": "math_prof",
                      "grade": "11", "doc_type": "textbook"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        doc = r.json()
        assert "_id" not in doc
        assert doc["status"] == "processing"
        doc_id = doc["id"]

        # poll until indexed
        status, pages, chunks = None, 0, 0
        for _ in range(15):
            time.sleep(2)
            lst = admin_client.get(f"{BASE_URL}/api/admin/kb", timeout=30).json()
            assert all("_id" not in d for d in lst)
            cur = next((d for d in lst if d["id"] == doc_id), None)
            assert cur, "uploaded doc missing from list"
            status, pages, chunks = cur["status"], cur.get("pages"), cur.get("chunks")
            if status in ("indexed", "error"):
                break
        assert status == "indexed", f"status={status} pages={pages} chunks={chunks}"
        assert pages >= 1 and chunks >= 1

        # search
        sr = admin_client.post(f"{BASE_URL}/api/admin/kb/search",
                               json={"subject_id": None, "query": "производная функции"}, timeout=60)
        assert sr.status_code == 200, sr.text[:200]
        results = sr.json()["results"]
        assert len(results) >= 1, "RAG search returned no chunks for indexed Cyrillic doc"
        assert any(x["doc_id"] == doc_id for x in results)
        assert results[0]["score"] > 0.01 and results[0]["page"] >= 1

        # subject filtered search
        sr2 = admin_client.post(f"{BASE_URL}/api/admin/kb/search",
                                json={"subject_id": "math_prof", "query": "точка максимума"}, timeout=60)
        assert sr2.status_code == 200 and len(sr2.json()["results"]) >= 1

        # reprocess
        rp = admin_client.post(f"{BASE_URL}/api/admin/kb/{doc_id}/reprocess", timeout=60)
        assert rp.status_code == 200 and rp.json()["ok"] is True
        for _ in range(15):
            time.sleep(2)
            lst = admin_client.get(f"{BASE_URL}/api/admin/kb", timeout=30).json()
            cur = next(d for d in lst if d["id"] == doc_id)
            if cur["status"] == "indexed":
                break
        assert cur["status"] == "indexed", f"reprocess left status={cur['status']}"

        # delete + verify removal
        dl = admin_client.delete(f"{BASE_URL}/api/admin/kb/{doc_id}", timeout=60)
        assert dl.status_code == 200
        lst = admin_client.get(f"{BASE_URL}/api/admin/kb", timeout=30).json()
        assert all(d["id"] != doc_id for d in lst)
        assert admin_client.delete(f"{BASE_URL}/api/admin/kb/{doc_id}", timeout=30).status_code == 404

    def test_reprocess_unknown_doc_404(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/kb/does-not-exist/reprocess", timeout=30)
        assert r.status_code == 404
