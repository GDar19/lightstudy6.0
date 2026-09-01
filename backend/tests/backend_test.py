"""LightStudy backend regression suite.
Modules covered: auth, onboarding, content(subjects), diagnostics, study plan,
practice/adaptive/mistakes, AI tutor (real Claude), dashboard/statistics/achievements,
mock exams, profile persistence, admin RBAC, cross-user isolation.
"""
import time

import pytest
import requests

from conftest import API


# ---------------- Auth ----------------
class TestAuth:
    def test_register_sets_cookies_and_user(self, student):
        r = student["register_response"]
        data = r.json()
        assert data["user"]["email"] == student["email"].lower()
        assert data["user"]["role"] == "student"
        assert data["user"]["onboarded"] is False
        assert "password_hash" not in data["user"]
        assert "_id" not in data["user"]
        cookies = r.cookies.get_dict()
        assert "access_token" in cookies, f"cookies={cookies}"
        assert "refresh_token" in cookies
        set_cookie = " ".join(v for k, v in r.headers.items() if k.lower() == "set-cookie")
        assert "HttpOnly" in set_cookie

    def test_me_with_cookie_only(self, student):
        s = requests.Session()
        s.cookies.update(student["session"].cookies)
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["email"] == student["email"].lower()

    def test_me_unauthorized(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_duplicate_register_rejected(self, student):
        r = requests.post(f"{API}/auth/register", json={
            "name": "dup", "email": student["email"], "password": "test123"})
        assert r.status_code == 400

    def test_login_and_wrong_password(self, student):
        r = requests.post(f"{API}/auth/login", json={
            "email": student["email"], "password": student["password"]})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == student["email"].lower()
        bad = requests.post(f"{API}/auth/login", json={
            "email": student["email"], "password": "wrongpass"})
        assert bad.status_code == 401

    def test_brute_force_lockout(self, student):
        """Playbook: account should lock after 5 failed attempts."""
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={
                "email": student["email"], "password": "definitelywrong"})
            codes.append(r.status_code)
        assert 423 in codes or 429 in codes, f"No lockout after 6 failures, codes={codes}"

    def test_logout_clears_cookies(self, student):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": student["email"],
                                              "password": student["password"]})
        assert r.status_code == 200
        out = s.post(f"{API}/auth/logout")
        assert out.status_code == 200
        assert s.get(f"{API}/auth/me").status_code == 401


# ---------------- Onboarding + subjects ----------------
class TestOnboardingAndContent:
    def test_onboarding_saves(self, student):
        s = student["session"]
        r = s.post(f"{API}/onboarding", json={
            "subjects": ["math_prof", "inf"], "target_score": 85,
            "exam_date": "2027-06-01", "daily_minutes": 90,
            "study_days": ["Понедельник"], "confidence": "medium"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["onboarded"] is True
        assert d["subjects"] == ["math_prof", "inf"]
        assert d["target_score"] == 85
        assert "_id" not in d and "password_hash" not in d
        me = s.get(f"{API}/auth/me").json()
        assert me["onboarded"] is True and me["target_score"] == 85

    def test_subjects_list(self, student):
        r = student["session"].get(f"{API}/subjects")
        assert r.status_code == 200
        subjects = r.json()
        ids = {x["id"] for x in subjects}
        assert {"math_prof", "rus", "phys", "inf", "soc", "bio"} <= ids, ids
        for x in subjects:
            assert "_id" not in x
            assert "mastery" in x

    def test_subject_detail(self, student):
        r = student["session"].get(f"{API}/subjects/math_prof")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["id"] == "math_prof"
        assert d.get("sections"), "no sections"
        topics = [t for sec in d["sections"] for t in sec.get("topics", [])]
        assert topics
        assert "mastery" in topics[0]

    def test_subject_not_found(self, student):
        r = student["session"].get(f"{API}/subjects/nope")
        assert r.status_code == 404


# ---------------- Diagnostic full flow ----------------
class TestDiagnostic:
    def test_full_flow(self, student):
        s = student["session"]
        s.post(f"{API}/onboarding", json={"subjects": ["math_prof", "inf"],
                                          "target_score": 85, "exam_date": "2027-06-01"})
        r = s.post(f"{API}/diagnostics/start", json={"subject_id": "math_prof"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        diag_id = d["diagnostic_id"]
        qs = d["questions"]
        assert 1 <= len(qs) <= 10
        for q in qs:
            assert "answer" not in q and "explanation" not in q, "correct answer leaked"
            assert len(q["options"]) >= 2

        # answer all: first half index 0, rest deliberately varied
        for i, q in enumerate(qs):
            ans = s.post(f"{API}/diagnostics/{diag_id}/answer",
                         json={"question_id": q["id"], "answer": i % len(q["options"])})
            assert ans.status_code == 200, ans.text[:300]
            body = ans.json()
            assert isinstance(body["is_correct"], bool)
            assert body["explanation"] is not None

        fin = s.post(f"{API}/diagnostics/{diag_id}/finish")
        assert fin.status_code == 200, fin.text[:300]
        f = fin.json()
        assert 0 <= f["score"] <= 100
        assert f["level"] in ["Начальный", "Средний", "Высокий"]

        res = s.get(f"{API}/diagnostics/{diag_id}/results")
        assert res.status_code == 200
        rr = res.json()
        assert rr["subject_id"] == "math_prof"
        assert rr["topics"] and isinstance(rr["recommendations"], list)
        assert "strong" in rr and "weak" in rr

        hist = s.get(f"{API}/diagnostics")
        assert hist.status_code == 200
        assert any(x["id"] == diag_id for x in hist.json())

        # achievement granted
        ach = s.get(f"{API}/achievements").json()
        first = [a for a in ach if a.get("code") == "first_diagnostic"]
        assert first and first[0].get("earned") is True, first

    def test_diagnostic_bad_subject(self, student):
        r = student["session"].post(f"{API}/diagnostics/start", json={"subject_id": "zzz"})
        assert r.status_code == 404

    def test_diagnostic_requires_auth(self):
        r = requests.post(f"{API}/diagnostics/start", json={"subject_id": "math_prof"})
        assert r.status_code == 401


# ---------------- Study plan ----------------
class TestStudyPlan:
    def test_generate_and_toggle(self, student):
        s = student["session"]
        s.post(f"{API}/onboarding", json={"subjects": ["math_prof", "inf"],
                                          "target_score": 85, "exam_date": "2027-06-01"})
        r = s.post(f"{API}/study-plan/generate")
        assert r.status_code == 200, r.text[:300]
        gen = r.json()
        assert gen["count"] > 0
        item = gen["items"][0]
        assert "_id" not in item
        assert item["status"] == "planned"
        assert item["topic_id"] and item["activity_type"]

        got = s.get(f"{API}/study-plan")
        assert got.status_code == 200
        pl = got.json()
        assert pl["has_plan"] is True and len(pl["items"]) == gen["count"]

        pid = pl["items"][0]["id"]
        patch = s.patch(f"{API}/study-plan/items/{pid}", json={"status": "done", "completion": 100})
        assert patch.status_code == 200, patch.text[:300]
        assert patch.json()["status"] == "done"
        after = s.get(f"{API}/study-plan").json()
        assert next(i for i in after["items"] if i["id"] == pid)["status"] == "done"

    def test_patch_unknown_item(self, student):
        r = student["session"].patch(f"{API}/study-plan/items/nope", json={"status": "done"})
        assert r.status_code == 404


# ---------------- Practice, adaptive, mistakes ----------------
class TestPracticeAndMistakes:
    def test_practice_wrong_creates_mistake_and_resolve(self, student):
        s = student["session"]
        s.post(f"{API}/onboarding", json={"subjects": ["math_prof", "inf"],
                                          "target_score": 85, "exam_date": "2027-06-01"})
        start = s.post(f"{API}/practice/start", json={"subject_id": "math_prof",
                                                     "mode": "adaptive"})
        assert start.status_code == 200, start.text[:300]
        d = start.json()
        sid, qs = d["session_id"], d["questions"]
        assert qs and all("answer" not in q for q in qs)

        q = qs[0]
        # find correct answer by trying: first submit an intentionally wrong-ish answer
        a1 = s.post(f"{API}/practice/answer", json={"session_id": sid,
                                                    "question_id": q["id"], "answer": 0})
        assert a1.status_code == 200, a1.text[:300]
        b1 = a1.json()
        assert "mastery" in b1 and b1["difficulty"] in ["easy", "medium", "hard", "ege"]
        correct_idx = b1["correct_answer"]
        wrong_idx = (correct_idx + 1) % len(q["options"])

        # ensure a wrong answer is registered
        aw = s.post(f"{API}/practice/answer", json={"session_id": sid,
                                                    "question_id": q["id"], "answer": wrong_idx})
        assert aw.status_code == 200
        assert aw.json()["is_correct"] is False

        mistakes = s.get(f"{API}/mistakes")
        assert mistakes.status_code == 200
        ms = mistakes.json()
        rec = [m for m in ms if m["question_id"] == q["id"]]
        assert rec, f"wrong answer did not create mistake record; got {len(ms)} mistakes"
        assert rec[0]["correct_answer"] == correct_idx
        assert "_id" not in rec[0]

        # mistakes practice mode returns that question
        mp = s.post(f"{API}/practice/start", json={"subject_id": "math_prof", "mode": "mistakes"})
        assert mp.status_code == 200, mp.text[:300]
        assert q["id"] in [x["id"] for x in mp.json()["questions"]]

        retry = s.post(f"{API}/mistakes/retry")
        assert retry.status_code == 200
        assert retry.json()["total"] >= 1

        # answer correctly -> mistake resolved
        ac = s.post(f"{API}/practice/answer", json={"session_id": sid,
                                                    "question_id": q["id"], "answer": correct_idx})
        assert ac.status_code == 200 and ac.json()["is_correct"] is True
        ms2 = s.get(f"{API}/mistakes").json()
        rec2 = [m for m in ms2 if m["question_id"] == q["id"]]
        assert rec2 and rec2[0].get("resolved") is True, rec2

        fin = s.post(f"{API}/practice/{sid}/finish")
        assert fin.status_code == 200
        fb = fin.json()
        assert fb["total"] >= 1 and 0 <= fb["accuracy"] <= 100

    def test_practice_invalid_session(self, student):
        r = student["session"].post(f"{API}/practice/answer", json={
            "session_id": "nope", "question_id": "nope", "answer": 0})
        assert r.status_code == 404

    def test_practice_no_questions(self, student):
        r = student["session"].post(f"{API}/practice/start", json={
            "subject_id": "math_prof", "topic_id": "does_not_exist"})
        assert r.status_code == 400


# ---------------- AI tutor (real Claude) ----------------
class TestAITutor:
    FALLBACK = "ИИ-помощник временно недоступен"

    def test_ai_status(self, student):
        r = student["session"].get(f"{API}/ai/status")
        assert r.status_code == 200
        assert r.json()["available"] is True

    def test_chat_real_answer_and_persistence(self, student):
        s = student["session"]
        r = s.post(f"{API}/ai/chat", json={"message": "Объясни кратко, что такое производная?",
                                           "topic_id": "derivative"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["available"] is True
        assert d["answer"] and len(d["answer"]) > 40, d["answer"]
        assert self.FALLBACK not in d["answer"], "AI returned fallback text (provider error)"
        conv_id = d["conversation_id"]

        convs = s.get(f"{API}/ai/conversations")
        assert convs.status_code == 200
        assert any(c["id"] == conv_id for c in convs.json())
        assert all("_id" not in c for c in convs.json())

        msgs = s.get(f"{API}/ai/conversations/{conv_id}")
        assert msgs.status_code == 200
        m = msgs.json()["messages"]
        assert len(m) >= 2 and m[0]["role"] == "user" and m[-1]["role"] == "assistant"

    def test_explain(self, student):
        r = student["session"].post(f"{API}/ai/explain",
                                    json={"topic_id": "derivative", "mode": "default"},
                                    timeout=120)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["available"] is True
        assert d["answer"] and self.FALLBACK not in d["answer"], d["answer"][:200]

    def test_conversation_not_found(self, student):
        r = student["session"].get(f"{API}/ai/conversations/nope")
        assert r.status_code == 404


# ---------------- Dashboard / statistics / achievements ----------------
class TestDashboardStats:
    def test_new_user_dashboard_is_zero(self):
        s = requests.Session()
        email = f"TEST_zero_{int(time.time()*1000)}@ls.ru"
        reg = s.post(f"{API}/auth/register", json={"name": "TEST Zero",
                                                   "email": email, "password": "test123"})
        assert reg.status_code == 200
        s.headers.update({"Authorization": f"Bearer {reg.json()['token']}"})
        s.post(f"{API}/onboarding", json={"subjects": ["math_prof"], "target_score": 80,
                                          "exam_date": "2027-06-01"})
        r = s.get(f"{API}/dashboard")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["tasks_completed"] == 0, d
        assert d["overall_progress"] == 0, d
        assert d["streak"] in (0, 1)
        assert isinstance(d.get("today_tasks"), list)
        assert isinstance(d.get("weak_topics"), list)

        st = s.get(f"{API}/statistics")
        assert st.status_code == 200
        sd = st.json()
        assert isinstance(sd.get("subject_mastery"), list)
        assert isinstance(sd.get("progress_over_time"), list)
        assert isinstance(sd.get("weak_topics"), list)

    def test_dashboard_reflects_activity(self, student):
        s = student["session"]
        start = s.post(f"{API}/practice/start", json={"subject_id": "math_prof"})
        assert start.status_code == 200
        d = start.json()
        q = d["questions"][0]
        s.post(f"{API}/practice/answer", json={"session_id": d["session_id"],
                                               "question_id": q["id"], "answer": 0})
        dash = s.get(f"{API}/dashboard")
        assert dash.status_code == 200, dash.text[:300]
        assert dash.json()["tasks_completed"] >= 1

        st = s.get(f"{API}/statistics").json()
        assert st["subject_mastery"], "statistics has no mastery after practice"

    def test_progress_and_notifications(self, student):
        s = student["session"]
        for path in ["/progress", "/achievements", "/notifications"]:
            r = s.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
        r = s.post(f"{API}/notifications/read-all")
        assert r.status_code == 200


# ---------------- Mock exams ----------------
class TestMockExams:
    def test_mock_flow(self, student):
        s = student["session"]
        s.post(f"{API}/onboarding", json={"subjects": ["math_prof", "inf"],
                                          "target_score": 85, "exam_date": "2027-06-01"})
        lst = s.get(f"{API}/mock-exams")
        assert lst.status_code == 200, lst.text[:300]
        exams = lst.json()["exams"]
        assert exams and all("duration" in e and "question_count" in e for e in exams)

        st = s.post(f"{API}/mock-exams/start", json={"subject_id": "math_prof"})
        assert st.status_code == 200, st.text[:300]
        d = st.json()
        assert d["duration_min"] > 0
        qs = d["questions"]
        assert len(qs) == 12, f"expected 12 questions, got {len(qs)}"
        assert all("answer" not in q for q in qs)

        answers = {q["id"]: 0 for q in qs}
        fin = s.post(f"{API}/mock-exams/{d['attempt_id']}/finish",
                     json={"answers": answers, "time_spent": 600})
        assert fin.status_code == 200, fin.text[:300]
        f = fin.json()
        assert 0 <= f["accuracy"] <= 100 and f["total"] == 12
        assert f["time_spent"] == 600
        assert isinstance(f["topic_breakdown"], list) and f["topic_breakdown"]
        assert isinstance(f["review"], list)
        assert isinstance(f["recommendations"], list)

        got = s.get(f"{API}/mock-exams/{d['attempt_id']}")
        assert got.status_code == 200
        assert got.json()["status"] == "completed"
        assert "_id" not in got.json()

        hist = s.get(f"{API}/mock-exams").json()["history"]
        assert any(h["id"] == d["attempt_id"] for h in hist)

    def test_mock_bad_subject(self, student):
        r = student["session"].post(f"{API}/mock-exams/start", json={"subject_id": "zzz"})
        assert r.status_code == 404


# ---------------- Profile persistence ----------------
class TestProfile:
    def test_profile_update_persists_after_relogin(self, student):
        s = student["session"]
        r = s.patch(f"{API}/profile", json={"name": "TEST Обновлённое Имя",
                                            "target_score": 92,
                                            "subjects": ["math_prof", "phys"]})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["name"] == "TEST Обновлённое Имя" and d["target_score"] == 92
        assert set(d["subjects"]) == {"math_prof", "phys"}

        fresh = requests.Session()
        li = fresh.post(f"{API}/auth/login", json={"email": student["email"],
                                                    "password": student["password"]})
        assert li.status_code == 200
        me = fresh.get(f"{API}/auth/me").json()
        assert me["name"] == "TEST Обновлённое Имя"
        assert me["target_score"] == 92
        assert set(me["subjects"]) == {"math_prof", "phys"}
        # restore
        s.patch(f"{API}/profile", json={"subjects": ["math_prof", "inf"]})


# ---------------- Admin RBAC ----------------
class TestAdmin:
    def test_admin_endpoints(self, admin):
        s = admin["session"]
        stats = s.get(f"{API}/admin/stats")
        assert stats.status_code == 200, stats.text[:300]
        sd = stats.json()
        assert sd["subjects"] == 6 and sd["questions"] > 0

        users = s.get(f"{API}/admin/users")
        assert users.status_code == 200
        assert all("password_hash" not in u and "_id" not in u for u in users.json())

        qs = s.get(f"{API}/admin/questions", params={"subject_id": "math_prof"})
        assert qs.status_code == 200 and qs.json()
        assert all(q["subject_id"] == "math_prof" for q in qs.json())

        topics = s.get(f"{API}/admin/topics")
        assert topics.status_code == 200 and topics.json()

    def test_admin_question_crud(self, admin):
        s = admin["session"]
        payload = {"subject_id": "math_prof", "topic_id": "derivative",
                   "difficulty": "medium", "question": "TEST_вопрос 2+2?",
                   "options": ["3", "4", "5", "6"], "answer": 1,
                   "explanation": "TEST", "ege_category": "TEST"}
        c = s.post(f"{API}/admin/questions", json=payload)
        assert c.status_code == 200, c.text[:300]
        created = c.json()
        assert "_id" not in created and created["question"] == payload["question"]
        qid = created["id"]

        listing = s.get(f"{API}/admin/questions", params={"subject_id": "math_prof"}).json()
        assert any(q["id"] == qid for q in listing), "created question not persisted"

        p = s.patch(f"{API}/admin/questions/{qid}", json={**payload, "question": "TEST_updated?"})
        assert p.status_code == 200 and p.json()["question"] == "TEST_updated?"

        d = s.delete(f"{API}/admin/questions/{qid}")
        assert d.status_code == 200
        listing2 = s.get(f"{API}/admin/questions", params={"subject_id": "math_prof"}).json()
        assert not any(q["id"] == qid for q in listing2)
        assert s.delete(f"{API}/admin/questions/{qid}").status_code == 404

    @pytest.mark.parametrize("path", ["/admin/stats", "/admin/users", "/admin/questions",
                                       "/admin/topics"])
    def test_student_forbidden(self, student, path):
        r = student["session"].get(f"{API}{path}")
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_student_cannot_write_questions(self, student):
        r = student["session"].post(f"{API}/admin/questions", json={
            "subject_id": "math_prof", "topic_id": "derivative",
            "question": "hack", "options": ["a", "b"], "answer": 0})
        assert r.status_code == 403


# ---------------- Cross-user isolation ----------------
class TestIsolation:
    def test_cannot_read_other_users_data(self, student, student2):
        s1, s2 = student["session"], student2["session"]
        s1.post(f"{API}/onboarding", json={"subjects": ["math_prof"], "target_score": 80,
                                           "exam_date": "2027-06-01"})
        diag = s1.post(f"{API}/diagnostics/start", json={"subject_id": "math_prof"}).json()
        did = diag["diagnostic_id"]
        assert s2.get(f"{API}/diagnostics/{did}/results").status_code == 404
        assert s2.post(f"{API}/diagnostics/{did}/finish").status_code == 404

        mock = s1.post(f"{API}/mock-exams/start", json={"subject_id": "math_prof"}).json()
        assert s2.get(f"{API}/mock-exams/{mock['attempt_id']}").status_code == 404

        prac = s1.post(f"{API}/practice/start", json={"subject_id": "math_prof"}).json()
        assert s2.post(f"{API}/practice/{prac['session_id']}/finish").status_code == 404

        s1.post(f"{API}/study-plan/generate")
        items = s1.get(f"{API}/study-plan").json()["items"]
        if items:
            assert s2.patch(f"{API}/study-plan/items/{items[0]['id']}",
                            json={"status": "done"}).status_code == 404
