"""Phase 4: Hybrid smart practice — AI-generated + persisted tasks with source traceability."""
import time
import pytest
import requests
from tests.conftest import API


# ---------- helpers ----------

def _login_admin(session, creds):
    r = session.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    session.headers.update({"Authorization": f"Bearer {tok}"})
    return r.json()["user"]


# ---------- backend tests ----------

class TestPracticeSmart:
    """Hybrid smart practice API"""

    def test_start_smart_math_prof_derivative(self, student):
        s = student["session"]
        r = s.post(f"{API}/practice/start", json={
            "subject_id": "math_prof",
            "topic_id": "derivative",
            "difficulty": "ege",
            "count": 3,
            "smart": True,
        }, timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data and isinstance(data["session_id"], str)
        assert isinstance(data["questions"], list)
        assert 1 <= len(data["questions"]) <= 3
        # every returned q looks well-formed (server-side strip_answer output)
        for q in data["questions"]:
            assert q.get("question")
            assert isinstance(q.get("options"), list)
            # single_choice tasks (including AI-generated) must have >= 2 options;
            # numeric/other typed tasks may legitimately have none.
            if q.get("type", "single_choice") == "single_choice":
                assert len(q["options"]) >= 2, f"single_choice with no options: {q}"

    def test_start_smart_false_regression(self, student):
        s = student["session"]
        r = s.post(f"{API}/practice/start", json={
            "subject_id": "math_prof",
            "topic_id": "derivative",
            "count": 3,
            "smart": False,
        }, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("session_id")

    def test_start_smart_answering_does_not_500(self, student):
        """Smart mode: pick one q, submit an answer → mastery path works."""
        s = student["session"]
        r = s.post(f"{API}/practice/start", json={
            "subject_id": "math_prof", "topic_id": "derivative",
            "difficulty": "ege", "count": 3, "smart": True,
        }, timeout=180)
        assert r.status_code == 200
        d = r.json()
        if not d["questions"]:
            pytest.skip("no questions to answer")
        q = d["questions"][0]
        # answer with option 0 (or "0" for numeric)
        ans = 0 if q.get("type", "single_choice") == "single_choice" else "0"
        r2 = s.post(f"{API}/practice/answer", json={
            "session_id": d["session_id"],
            "question_id": q["id"],
            "answer": ans,
        }, timeout=60)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert "is_correct" in j and "mastery" in j
        # mastery is a number between 0 and 100
        assert isinstance(j["mastery"], (int, float))
        assert 0 <= j["mastery"] <= 100


class TestAIGeneratedAdminVisibility:
    """AI tasks appear in admin listing with traceability fields"""

    def test_admin_list_ai_generated_true(self, admin):
        r = admin["session"].get(f"{API}/admin/questions",
                                 params={"ai_generated": "true"}, timeout=60)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1, "expected at least one AI-generated task in DB"
        for q in items:
            assert q.get("ai_generated") is True
            # AI-generated tasks should be flagged unverified
            assert q.get("verified") in (False, None)
            assert q.get("type") == "single_choice"
            assert isinstance(q.get("options"), list) and len(q["options"]) >= 2
            ans = q.get("answer")
            assert isinstance(ans, int) and 0 <= ans < len(q["options"])
            # mongo _id must be scrubbed
            assert "_id" not in q

    def test_at_least_one_math_prof_task_has_source_traceability(self, admin):
        r = admin["session"].get(f"{API}/admin/questions",
                                 params={"ai_generated": "true",
                                         "subject_id": "math_prof"}, timeout=60)
        assert r.status_code == 200
        items = r.json()
        with_source = [q for q in items
                       if q.get("source_doc_id") and q.get("source_doc_title")]
        assert with_source, ("Expected ≥1 math_prof AI task with source traceability "
                             "(source_doc_id + source_doc_title populated)")
        q = with_source[0]
        assert q.get("source_page") is not None
        # source_context may be None only when kb had no snippets; if we see profmat
        # we expect a context snippet
        if "профмат" in (q.get("source_doc_title") or "").lower():
            assert q.get("source_context"), "profmat-sourced task should carry context"

    def test_admin_can_toggle_verified_on_ai_task(self, admin):
        r = admin["session"].get(f"{API}/admin/questions",
                                 params={"ai_generated": "true"}, timeout=60)
        items = r.json()
        if not items:
            pytest.skip("no ai tasks")
        qid = items[0]["id"]
        r2 = admin["session"].patch(f"{API}/admin/questions/{qid}/verify",
                                    json={"verified": True}, timeout=30)
        # tolerate 200 or 404 depending on route naming, but preferred is 200
        assert r2.status_code in (200, 204), r2.text
        # revert so admin visibility filter still finds unverified AI tasks next run
        admin["session"].patch(f"{API}/admin/questions/{qid}/verify",
                               json={"verified": False}, timeout=30)


class TestRegressionPhases:
    """Light regression across phases 1-3"""

    def test_admin_task_list_works(self, admin):
        r = admin["session"].get(f"{API}/admin/questions", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_extended_response_excluded_from_practice_start(self, student):
        s = student["session"]
        r = s.post(f"{API}/practice/start", json={
            "subject_id": "math_prof", "count": 20, "smart": False,
        }, timeout=60)
        if r.status_code != 200:
            pytest.skip("no math_prof pool")
        for q in r.json()["questions"]:
            assert q.get("type") != "extended_response"

    def test_ai_chat_still_responds(self, student):
        s = student["session"]
        r = s.post(f"{API}/ai/chat", json={
            "message": "Что такое производная?",
            "subject_id": "math_prof",
        }, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("answer") or data.get("message") or data.get("reply")
