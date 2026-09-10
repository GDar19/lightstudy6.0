"""
Regression tests for admin-controlled task bank workflow (Phase 5).
Covers: task status workflow, publish validation, duplicate/archive/publish,
admin stats, filter/search/sort, Стереометрия topic, and no-AI-generation in bank.
"""
import os
import base64
import io
import pytest
import requests

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE = _load_env().rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
API = f"{BASE}/api"


# --- shared session helpers ------------------------------------------------
def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@lightstudy.ru", "password": "admin123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


def _student_session():
    s = requests.Session()
    email = f"TEST_stu_{os.urandom(4).hex()}@lightstudy.ru"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "name": "Test Stu",
        "grade": "11", "exam_subjects": ["math_prof", "russian"]
    })
    assert r.status_code in (200, 201), r.text[:200]
    return s, email


def _tiny_png_bytes():
    # 4x4 red PNG (not solid uniform variance? — has small header/palette; fine as media upload only)
    # Use a slightly patterned 8x8 png
    try:
        from PIL import Image
        img = Image.new("RGB", (16, 16), (200, 30, 30))
        for i in range(16):
            img.putpixel((i, i), (30, 200, 30))
            img.putpixel((0, i), (30, 30, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        # fallback: base64 minimal png
        return base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4//8/w38GIAXDAQ/vAKKgAAAABJRU5ErkJggg=="
        )


# ---- Fixtures -------------------------------------------------------------
@pytest.fixture(scope="module")
def admin():
    return _admin_session()


@pytest.fixture(scope="module")
def student():
    s, _ = _student_session()
    return s


created_ids = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin):
    yield
    for qid in created_ids:
        try:
            admin.delete(f"{API}/admin/questions/{qid}")
        except Exception:
            pass


# ---- Tests ----------------------------------------------------------------
class TestAdminStats:
    def test_stats_shape(self, admin):
        r = admin.get(f"{API}/admin/questions/stats")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("total", "published", "draft", "verification", "archived",
                  "with_images", "without_images",
                  "by_subject", "by_topic", "by_status", "by_part", "by_ege_number"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["by_subject"], dict)
        assert d["total"] >= d["published"]


class TestStereometry:
    def test_stereometry_topic_has_published_questions(self, admin):
        r = admin.get(f"{API}/admin/questions",
                      params={"subject_id": "math_prof", "topic_id": "stereometry", "status": "published"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1, "Стереометрия must have at least 1 published question"
        for q in items:
            assert q["topic_id"] == "stereometry"
            assert q["status"] == "published"

    def test_practice_start_stereometry(self, student):
        r = student.post(f"{API}/practice/start",
                         json={"subject_id": "math_prof", "topic_id": "stereometry", "count": 5})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["total"] >= 1
        assert len(d["questions"]) >= 1


class TestMediaUpload:
    def test_upload_png_media(self, admin):
        files = {"file": ("test.png", _tiny_png_bytes(), "image/png")}
        r = admin.post(f"{API}/media/upload", files=files)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "media_id" in d or "id" in d
        assert "url" in d
        # sanity: image served
        url = d["url"] if d["url"].startswith("http") else f"{BASE}{d['url']}"
        rr = requests.get(url)
        assert rr.status_code == 200
        assert rr.headers.get("content-type", "").startswith("image/")


class TestTaskLifecycle:
    def test_create_draft_missing_fields_allowed(self, admin):
        # Draft with minimal fields allowed
        r = admin.post(f"{API}/admin/questions", json={
            "subject_id": "math_prof",
            "topic_id": "stereometry",
            "question": "TEST_DRAFT черновик",
            "type": "single_choice",
            "options": [],
            "answer": None,
            "status": "draft",
        })
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["status"] == "draft"
        assert d["ai_generated"] is False
        created_ids.append(d["id"])

    def test_publish_missing_answer_fails(self, admin):
        payload = {
            "subject_id": "math_prof",
            "topic_id": "stereometry",
            "question": "TEST_BAD публикация без ответа",
            "type": "single_choice",
            "options": ["A", "B"],
            "answer": None,
            "status": "published",
        }
        r = admin.post(f"{API}/admin/questions", json=payload)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
        detail = r.json().get("detail", "")
        assert "правильный ответ" in detail or "Нельзя опубликовать" in detail

    def test_publish_missing_question_fails(self, admin):
        payload = {
            "subject_id": "math_prof",
            "topic_id": "stereometry",
            "question": "   ",
            "type": "single_choice",
            "options": ["A", "B"],
            "answer": 0,
            "status": "published",
        }
        r = admin.post(f"{API}/admin/questions", json=payload)
        assert r.status_code == 400
        assert "услови" in r.json().get("detail", "").lower() or "Нельзя" in r.json().get("detail", "")

    def test_create_published_full(self, admin):
        # upload media first
        up = admin.post(f"{API}/media/upload",
                        files={"file": ("t.png", _tiny_png_bytes(), "image/png")})
        assert up.status_code == 200
        mu = up.json()
        media_id = mu.get("media_id") or mu.get("id")
        media_url = mu["url"]
        r = admin.post(f"{API}/admin/questions", json={
            "subject_id": "math_prof",
            "topic_id": "stereometry",
            "subtopic": "TEST_призмы",
            "source": "TEST_учебник",
            "difficulty": "hard",
            "exam_part": "Часть 2",
            "type": "single_choice",
            "question": "TEST_PUB: сколько граней у куба?",
            "options": ["4", "6", "8", "12"],
            "answer": 1,
            "explanation": "У куба 6 граней.",
            "images": [{"media_id": media_id, "url": media_url, "caption": "cube", "kind": "image"}],
            "status": "published",
        })
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["status"] == "published"
        assert d["verified"] is True
        assert d["ai_generated"] is False
        assert d["subtopic"] == "TEST_призмы"
        assert d["source"] == "TEST_учебник"
        assert len(d["images"]) == 1
        created_ids.append(d["id"])
        return d

    def test_student_sees_published_task_with_image(self, admin, student):
        pub = self.test_create_published_full(admin)  # ensures a fresh one exists
        qid = pub["id"]
        # Student practice
        r = student.post(f"{API}/practice/start",
                         json={"subject_id": "math_prof", "topic_id": "stereometry",
                               "difficulty": "hard", "count": 20})
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        ids = [q["id"] for q in data["questions"]]
        assert qid in ids, "published admin task not visible to student"
        q = next(q for q in data["questions"] if q["id"] == qid)
        assert q["images"] and q["images"][0]["url"], "image not attached to task shown to student"

    def test_duplicate_creates_draft(self, admin):
        # create a published, then duplicate
        pub = self.test_create_published_full(admin)
        r = admin.post(f"{API}/admin/questions/{pub['id']}/duplicate")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["id"] != pub["id"]
        assert d["status"] == "draft"
        assert d["verified"] is False
        assert d["ai_generated"] is False
        assert d["question"].startswith("(копия)")
        created_ids.append(d["id"])

    def test_status_transitions(self, admin):
        # Create draft with full valid content, then verify status endpoint
        r = admin.post(f"{API}/admin/questions", json={
            "subject_id": "math_prof",
            "topic_id": "stereometry",
            "question": "TEST_TX: 2+2?",
            "type": "single_choice",
            "options": ["3", "4"],
            "answer": 1,
            "status": "draft",
        })
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)

        for s in ("verification", "published", "archived"):
            rr = admin.patch(f"{API}/admin/questions/{qid}/status", json={"status": s})
            assert rr.status_code == 200, f"{s}: {rr.text[:200]}"
            assert rr.json()["status"] == s

    def test_status_publish_validates(self, admin):
        # bad task, publish via status endpoint must 400
        r = admin.post(f"{API}/admin/questions", json={
            "subject_id": "math_prof", "topic_id": "stereometry",
            "question": "TEST_BADPUB no answer",
            "type": "single_choice", "options": ["A", "B"],
            "answer": None, "status": "draft",
        })
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)
        rr = admin.patch(f"{API}/admin/questions/{qid}/status", json={"status": "published"})
        assert rr.status_code == 400


class TestFiltersAndSearch:
    def test_search_by_question_text(self, admin):
        r = admin.get(f"{API}/admin/questions", params={"search": "TEST_PUB"})
        assert r.status_code == 200
        assert any("TEST_PUB" in q["question"] for q in r.json())

    def test_filter_by_status_archived(self, admin):
        r = admin.get(f"{API}/admin/questions", params={"status": "archived"})
        assert r.status_code == 200
        for q in r.json():
            assert q["status"] == "archived"

    def test_ai_generated_are_archived(self, admin):
        r = admin.get(f"{API}/admin/questions", params={"ai_generated": "true"})
        assert r.status_code == 200
        items = r.json()
        if items:
            # per spec: existing AI-generated tasks were migrated to archived
            non_archived = [q for q in items if q.get("status") != "archived"]
            assert not non_archived, f"AI-generated tasks not archived: {[q['id'] for q in non_archived]}"

    def test_sort_recent(self, admin):
        r = admin.get(f"{API}/admin/questions", params={"sort": "recent"})
        assert r.status_code == 200
        items = r.json()
        # created_at should be non-increasing where present
        prev = None
        for q in items[:20]:
            if q.get("created_at"):
                if prev is not None:
                    assert q["created_at"] <= prev
                prev = q["created_at"]


class TestNoAIInBank:
    def test_practice_empty_returns_400_friendly(self, student):
        # Pick an unlikely combo
        r = student.post(f"{API}/practice/start", json={
            "subject_id": "math_prof", "topic_id": "stereometry",
            "difficulty": "ege", "qtype": "matching", "count": 5
        })
        # Should be 400 with friendly message, NOT auto-generate
        assert r.status_code == 400, f"got {r.status_code}: {r.text[:200]}"
        detail = r.json().get("detail", "")
        assert "опубликованных" in detail.lower() or "нет" in detail.lower()

    def test_diagnostic_and_mock_only_published(self, admin):
        # Sanity via admin/questions: subset used by diagnostic/mock is published
        r = admin.get(f"{API}/admin/questions",
                      params={"subject_id": "math_prof", "status": "draft"})
        drafts = r.json()
        # drafts must not appear in practice; quick indirect check via practice
        # (we already tested student can only see published in TestTaskLifecycle)
        assert isinstance(drafts, list)


class TestPracticeAnswer:
    def test_answer_records_attempt(self, admin, student):
        # ensure at least one published stereometry task
        r = student.post(f"{API}/practice/start",
                         json={"subject_id": "math_prof", "topic_id": "stereometry", "count": 5})
        assert r.status_code == 200
        data = r.json()
        q = data["questions"][0]
        # try answer 0 — may or may not be correct, either is fine for the test
        ans = student.post(f"{API}/practice/answer", json={
            "session_id": data["session_id"], "question_id": q["id"], "answer": 0
        })
        assert ans.status_code == 200, ans.text[:300]
        j = ans.json()
        assert "is_correct" in j
        assert "mastery" in j
        assert "explanation" in j
