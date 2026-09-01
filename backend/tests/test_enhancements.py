"""Enhancement-round tests: subject catalog (12), new answer types grading,
practice selectors, mastery calibration, interactive lessons, mock exams, admin subjects."""
import os
import re
import time
import uuid
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

EXPECTED_SUBJECTS = {"math_prof", "rus", "phys", "inf", "soc", "bio",
                     "math_base", "chem", "hist", "geo", "eng", "lit"}


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    email = re.search(r'(?im)^\s*[-*]?\s*Email:\s*`?([^`\s]+)', content)
    password = re.search(r'(?im)^\s*[-*]?\s*Password:\s*`?([^`\s]+)', content)
    return email.group(1), password.group(1)


@pytest.fixture(scope="module")
def admin_s():
    email, password = _creds()
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


def _new_student(subjects=("math_prof",)):
    s = requests.Session()
    email = f"TEST_enh_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}@ls.ru"
    r = s.post(f"{API}/auth/register", json={"name": "TEST Enh", "email": email, "password": "test123"})
    assert r.status_code == 200, r.text[:300]
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    s.post(f"{API}/onboarding", json={"subjects": list(subjects), "goal_score": 85,
                                      "exam_date": "2027-06-01", "hours_per_week": 10,
                                      "grade": 11, "level": "medium"})
    return s, email


@pytest.fixture(scope="module")
def stu():
    s, email = _new_student()
    return s


# ---------- Subjects catalog / admin enable-disable ----------
class TestSubjects:
    def test_twelve_subjects(self, stu):
        r = stu.get(f"{API}/subjects")
        assert r.status_code == 200, r.text[:300]
        subs = r.json()
        ids = {x["id"] for x in subs}
        assert EXPECTED_SUBJECTS.issubset(ids), f"missing: {EXPECTED_SUBJECTS - ids}"
        assert len(subs) == 12, f"expected 12 enabled subjects, got {len(subs)}: {sorted(ids)}"
        for x in subs:
            assert "_id" not in x
            assert x.get("name")

    def test_admin_subjects_and_toggle(self, admin_s, stu):
        r = admin_s.get(f"{API}/admin/subjects")
        assert r.status_code == 200
        assert len(r.json()) >= 12
        # disable 'lit'
        r = admin_s.patch(f"{API}/admin/subjects/lit", json={"enabled": False})
        assert r.status_code == 200, r.text[:300]
        assert r.json()["enabled"] is False
        try:
            ids = {x["id"] for x in stu.get(f"{API}/subjects").json()}
            assert "lit" not in ids, "disabled subject still returned to students"
        finally:
            r = admin_s.patch(f"{API}/admin/subjects/lit", json={"enabled": True})
            assert r.status_code == 200
        ids = {x["id"] for x in stu.get(f"{API}/subjects").json()}
        assert "lit" in ids

    def test_toggle_unknown_subject_404(self, admin_s):
        r = admin_s.patch(f"{API}/admin/subjects/nope", json={"enabled": False})
        assert r.status_code == 404

    def test_student_cannot_toggle(self, stu):
        r = stu.patch(f"{API}/admin/subjects/lit", json={"enabled": False})
        assert r.status_code == 403


# ---------- Practice selectors + all answer types graded ----------
def _start(s, **kw):
    return s.post(f"{API}/practice/start", json=kw)


class TestPracticeSelectors:
    def test_difficulty_and_count(self, stu):
        r = _start(stu, subject_id="math_prof", topic_id="probability",
                   difficulty="hard", count=3)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["total"] <= 3 and d["total"] >= 1
        assert len(d["questions"]) == d["total"]
        for q in d["questions"]:
            assert q["difficulty"] == "hard"
            assert "answer" not in q and "answer_value" not in q
            assert q.get("type")

    def test_hint_present_on_hard_questions(self, stu):
        d = _start(stu, subject_id="math_prof", topic_id="probability",
                   difficulty="hard", count=10).json()
        assert any(q.get("hint") for q in d["questions"]), "no hints on hard probability questions"

    def test_numeric_question_type_exists(self, stu):
        d = _start(stu, subject_id="math_prof", difficulty="hard", count=40).json()
        types = {q["type"] for q in d["questions"]}
        assert "numeric" in types, f"types found: {types}"

    def test_no_questions_error(self, stu):
        r = _start(stu, subject_id="lit", topic_id="probability", difficulty="ege", count=5)
        assert r.status_code == 400


class TestAnswerTypes:
    """Create one question of each type via admin, answer it through practice."""

    created = []

    def _mk(self, admin_s, payload):
        base = {"subject_id": "math_prof", "topic_id": "probability",
                "difficulty": "hard", "explanation": "TEST expl", "hint": "TEST hint"}
        base.update(payload)
        r = admin_s.post(f"{API}/admin/questions", json=base)
        assert r.status_code == 200, r.text[:300]
        qid = r.json()["id"]
        TestAnswerTypes.created.append(qid)
        return qid

    def _answer(self, s, qid, ans):
        st = _start(s, subject_id="math_prof", topic_id="probability", difficulty="hard", count=40)
        assert st.status_code == 200
        sid = st.json()["session_id"]
        r = s.post(f"{API}/practice/answer", json={"session_id": sid, "question_id": qid, "answer": ans})
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_numeric_comma_and_dot(self, admin_s, stu):
        qid = self._mk(admin_s, {"type": "numeric", "question": "TEST numeric 0.24",
                                 "answer_value": "0.24"})
        assert self._answer(stu, qid, "0,24")["is_correct"] is True
        assert self._answer(stu, qid, "0.24")["is_correct"] is True
        res = self._answer(stu, qid, "0.25")
        assert res["is_correct"] is False
        assert res["correct_value"] == "0.24"
        assert res["type"] == "numeric"

    def test_text_case_insensitive(self, admin_s, stu):
        qid = self._mk(admin_s, {"type": "text", "question": "TEST text",
                                 "answer_value": ["Возрастает"]})
        assert self._answer(stu, qid, "возрастает")["is_correct"] is True
        assert self._answer(stu, qid, "  ВОЗРАСТАЕТ ")["is_correct"] is True
        assert self._answer(stu, qid, "убывает")["is_correct"] is False

    def test_multiple_choice_order_independent(self, admin_s, stu):
        qid = self._mk(admin_s, {"type": "multiple_choice", "question": "TEST multi",
                                 "options": ["a", "b", "c", "d"], "answer": [0, 2]})
        assert self._answer(stu, qid, [2, 0])["is_correct"] is True
        assert self._answer(stu, qid, [0, 2])["is_correct"] is True
        assert self._answer(stu, qid, [0])["is_correct"] is False
        assert self._answer(stu, qid, [0, 1, 2])["is_correct"] is False

    def test_true_false(self, admin_s, stu):
        qid = self._mk(admin_s, {"type": "true_false", "question": "TEST tf",
                                 "options": ["Верно", "Неверно"], "answer": 1})
        assert self._answer(stu, qid, 1)["is_correct"] is True
        assert self._answer(stu, qid, 0)["is_correct"] is False

    def test_mistakes_show_raw_answer_for_numeric_text(self, admin_s, stu):
        r = stu.get(f"{API}/mistakes")
        assert r.status_code == 200
        data = r.json()
        items = data["mistakes"] if isinstance(data, dict) else data
        nt = [m for m in items if m.get("type") in ("numeric", "text")]
        assert nt, "no numeric/text mistakes recorded"
        for m in nt:
            assert m.get("student_answer") not in (None, ""), m
            assert m.get("correct_value") not in (None, ""), m

    def test_cleanup(self, admin_s):
        for qid in TestAnswerTypes.created:
            r = admin_s.delete(f"{API}/admin/questions/{qid}")
            assert r.status_code in (200, 404)


# ---------- Mastery calibration ----------
class TestMasteryCalibration:
    def test_easy_only_capped(self, admin_s):
        s, _ = _new_student()
        st = _start(s, subject_id="math_prof", topic_id="probability", difficulty="easy", count=5)
        if st.status_code != 200:
            pytest.skip("no easy probability questions")
        sid = st.json()["session_id"]
        qs = st.json()["questions"]
        # fetch answers via admin to answer everything correctly
        adm = {q["id"]: q for q in admin_s.get(f"{API}/admin/questions?subject_id=math_prof").json()}
        mastery = 0
        answered = 0
        for q in qs:
            full = adm.get(q["id"])
            if not full:
                continue
            ans = full.get("answer") if full.get("type", "single_choice") not in ("numeric", "text") \
                else full.get("answer_value")
            if isinstance(ans, list) and full.get("type") in ("numeric", "text"):
                ans = ans[0]
            r = s.post(f"{API}/practice/answer", json={"session_id": sid, "question_id": q["id"], "answer": ans})
            assert r.status_code == 200, r.text[:200]
            assert r.json()["is_correct"] is True, f"admin answer rejected for {q['id']}"
            mastery = r.json()["mastery"]
            answered += 1
        assert answered >= 1
        assert mastery <= 45, f"easy-only mastery exceeded ceiling: {mastery}"
        assert mastery < 100

    def test_few_hard_correct_not_100(self, admin_s):
        s, _ = _new_student()
        st = _start(s, subject_id="math_prof", topic_id="probability", difficulty="hard", count=3)
        assert st.status_code == 200
        sid = st.json()["session_id"]
        adm = {q["id"]: q for q in admin_s.get(f"{API}/admin/questions?subject_id=math_prof").json()}
        mastery_seq = []
        for q in st.json()["questions"]:
            full = adm.get(q["id"])
            if not full:
                continue
            ans = full.get("answer_value") if full.get("type") in ("numeric", "text") else full.get("answer")
            if isinstance(ans, list) and full.get("type") in ("numeric", "text"):
                ans = ans[0]
            r = s.post(f"{API}/practice/answer", json={"session_id": sid, "question_id": q["id"], "answer": ans})
            assert r.status_code == 200
            mastery_seq.append(r.json()["mastery"])
        assert mastery_seq[-1] < 90, f"mastery jumped too fast: {mastery_seq}"
        assert mastery_seq[-1] > 0

    def test_diagnostic_mastery_moderate(self, stu):
        s, _ = _new_student()
        r = s.post(f"{API}/diagnostics/start", json={"subject_id": "math_prof"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        qs = d["questions"]
        assert len(qs) >= 5
        for q in qs:
            ans = 0 if q.get("type") in ("single_choice", "true_false") else (
                [0] if q.get("type") == "multiple_choice" else "0")
            rr = s.post(f"{API}/diagnostics/{d['diagnostic_id']}/answer", json={
                "question_id": q["id"], "answer": ans})
            assert rr.status_code == 200, rr.text[:200]
        fin = s.post(f"{API}/diagnostics/{d['diagnostic_id']}/finish")
        assert fin.status_code == 200, fin.text[:300]
        res = fin.json()
        km = s.get(f"{API}/knowledge") if False else None
        assert res.get("score") is not None
        # no topic should be 100 after guessing
        topics = res.get("topics") or res.get("topic_results") or []
        for t in topics:
            assert t.get("mastery", 0) < 100


# ---------- Interactive lessons ----------
class TestInteractiveLessons:
    def test_lesson_tasks_and_persistence(self, admin_s):
        s, _ = _new_student()
        r = s.get(f"{API}/topics/derivative")
        assert r.status_code == 200, r.text[:300]
        lessons = r.json()["lessons"]
        assert lessons, "no lessons for derivative"
        lid = lessons[0]["id"]
        r = s.get(f"{API}/lessons/{lid}")
        assert r.status_code == 200
        lesson = r.json()
        tasks = lesson.get("interactive_tasks", [])
        assert tasks, "lesson has no interactive_tasks"
        assert lesson.get("status") == "not_started"
        for t in tasks:
            assert "answer" in t or "answer_value" in t, t
            assert t.get("question") or t.get("prompt"), t

        # answer task 0 wrong then right
        r = s.post(f"{API}/lessons/{lid}/task-answer", json={"task_index": 0, "answer": "___wrong___"})
        assert r.status_code == 200, r.text[:300]
        wrong = r.json()
        assert wrong["is_correct"] is False
        assert wrong["explanation"]

        t0 = tasks[0]
        correct = t0.get("answer_value") if t0.get("type") in ("numeric", "text") else t0.get("answer")
        if isinstance(correct, list) and t0.get("type") in ("numeric", "text"):
            correct = correct[0]
        r = s.post(f"{API}/lessons/{lid}/task-answer", json={"task_index": 0, "answer": correct})
        assert r.status_code == 200
        assert r.json()["is_correct"] is True, r.json()

        # persistence
        r = s.get(f"{API}/lessons/{lid}")
        prior = r.json().get("prior_answers", {})
        assert "0" in prior or 0 in prior, prior
        rec = prior.get("0", prior.get(0))
        assert rec["is_correct"] is True
        assert r.json()["status"] in ("in_progress", "completed")

        # complete + re-openable
        r = s.post(f"{API}/lessons/{lid}/complete")
        assert r.status_code == 200
        r = s.get(f"{API}/lessons/{lid}")
        assert r.status_code == 200
        assert r.json().get("prior_answers")

    def test_bad_task_index(self):
        s, _ = _new_student()
        r = s.get(f"{API}/topics/derivative")
        lid = r.json()["lessons"][0]["id"]
        r = s.post(f"{API}/lessons/{lid}/task-answer", json={"task_index": 99, "answer": "1"})
        assert r.status_code == 404


# ---------- Mock exams ----------
class TestMockExam:
    def test_hard_mock_flow(self, admin_s):
        s, _ = _new_student()
        r = s.post(f"{API}/mock-exams/start", json={"subject_id": "math_prof"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["total"] == 15, d["total"]
        assert d["duration_min"] == 40
        diffs = [q["difficulty"] for q in d["questions"]]
        hard_share = sum(1 for x in diffs if x in ("hard", "ege")) / len(diffs)
        assert hard_share >= 0.5, f"mock not biased to hard: {diffs}"
        for q in d["questions"]:
            assert "answer" not in q and "answer_value" not in q
            assert q.get("type")

        adm = {q["id"]: q for q in admin_s.get(f"{API}/admin/questions?subject_id=math_prof").json()}
        answers = {}
        expected_correct = 0
        for i, q in enumerate(d["questions"]):
            full = adm.get(q["id"])
            if full and i % 2 == 0:
                a = full.get("answer_value") if full.get("type") in ("numeric", "text") else full.get("answer")
                if isinstance(a, list) and full.get("type") in ("numeric", "text"):
                    a = a[0]
                answers[q["id"]] = a
                expected_correct += 1
            else:
                answers[q["id"]] = "___zz___"
        r = s.post(f"{API}/mock-exams/{d['attempt_id']}/finish",
                   json={"answers": answers, "time_spent": 300})
        assert r.status_code == 200, r.text[:300]
        res = r.json()
        assert res.get("correct") == expected_correct, (res.get("correct"), expected_correct)
        assert isinstance(res.get("score"), int)
        assert res.get("total") == 15
        review = res.get("review") or []
        incorrect = 15 - expected_correct
        assert len(review) == incorrect, f"review covers only incorrect items: {len(review)} vs {incorrect}"
        for item in review:
            assert item.get("type")
            has_answer = item.get("correct_answer") is not None or item.get("correct_value") is not None
            assert has_answer, f"review item without correct answer: {item}"
        breakdown = res.get("topic_breakdown") or res.get("by_topic")
        assert breakdown, res.keys()
        # feeds knowledge profile
        st = s.get(f"{API}/statistics")
        assert st.status_code == 200
        assert st.json()


# ---------- Contextual AI tutor ----------
class TestTutorContext:
    def test_context_answer_is_real(self, stu):
        payload = {"message": "Помоги понять задачу по теме Производная: как найти производную x^3?",
                   "context": {"topic_id": "derivative", "topic_name": "Производная",
                               "lesson_title": "Производная функции"}}
        r = stu.post(f"{API}/ai/chat", json=payload, timeout=120)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        text = d.get("answer") or d.get("message") or ""
        assert len(text) > 60, text
        low = text.lower()
        assert "не удалось" not in low and "ошибка" not in low[:40], text[:200]
