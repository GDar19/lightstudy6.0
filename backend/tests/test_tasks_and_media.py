"""Phase 1 multimodal upgrade: image upload/serve, admin task CRUD for all new
question types (matching / ordering / table_completion / graph_analysis /
extended_response), verify flip, filters, and grading via /practice/answer.

Everything lives in a single class so pytest-xdist --dist loadscope keeps
all tests on the same worker (state is shared via class attributes)."""
import io

import pytest
import requests
from PIL import Image, ImageDraw

from conftest import API


def _real_png(size=(320, 220)) -> bytes:
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, size[0] - 10, size[1] - 10], outline="black", width=3)
    d.line([(20, size[1] - 30), (size[0] - 20, 30)], fill="blue", width=4)
    d.line([(20, size[1] - 30), (size[0] - 20, size[1] - 30)], fill="black", width=2)
    d.line([(20, size[1] - 30), (20, 30)], fill="black", width=2)
    d.ellipse([(140, 90), (200, 150)], outline="red", width=3)
    d.text((30, 30), "y = x", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestPhase1:
    """All Phase-1 tests share state via cls attributes."""

    created_ids: list = []
    media_id: str = ""
    graph_qid: str = ""
    match_qid: str = ""
    order_qid: str = ""
    table_qid: str = ""
    extended_qid: str = ""
    subject: dict = {}
    topic: dict = {}

    # ---------- setup: subject + topic ----------
    def test_00_pick_subject_topic(self, admin):
        subs = admin["session"].get(f"{API}/admin/subjects").json()
        chosen = next((s for s in subs if s.get("id") == "math_prof"), subs[0])
        topics = admin["session"].get(f"{API}/admin/topics").json()
        topic = next((t for t in topics if t.get("subject_id") == chosen["id"]), None)
        assert topic is not None, "no topic for subject"
        type(self).subject = chosen
        type(self).topic = topic

    # ---------- media ----------
    def test_01_admin_upload_and_serve(self, admin):
        png = _real_png()
        r = admin["session"].post(
            f"{API}/admin/media/upload",
            files={"file": ("graph.png", png, "image/png")},
            data={"purpose": "task"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("/api/media/")
        assert j["content_type"].startswith("image/") and j["size"] > 0
        type(self).media_id = j["media_id"]
        # public serve
        u = requests.get(f"{API}/media/{j['media_id']}")
        assert u.status_code == 200
        assert u.headers.get("content-type", "").startswith("image/")
        assert len(u.content) > 100

    def test_02_media_rejects_junk(self, admin):
        r = admin["session"].post(
            f"{API}/admin/media/upload",
            files={"file": ("bad.png", b"not-an-image", "image/png")})
        assert r.status_code == 400

    def test_03_media_upload_requires_admin(self, student):
        r = student["session"].post(
            f"{API}/admin/media/upload",
            files={"file": ("g.png", _real_png(), "image/png")})
        assert r.status_code in (401, 403)

    def test_04_missing_media_404(self):
        r = requests.get(f"{API}/media/nonexistent-id")
        assert r.status_code == 404

    # ---------- CRUD for all task types ----------
    def _post(self, admin, payload):
        payload["subject_id"] = self.subject["id"]
        payload["topic_id"] = self.topic["topic_id"]
        r = admin["session"].post(f"{API}/admin/questions", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        type(self).created_ids.append(q["id"])
        return q

    def test_10_create_single_choice(self, admin):
        q = self._post(admin, {
            "type": "single_choice", "question": "TEST_ 2+2?",
            "options": ["3", "4", "5", "22"], "answer": 1,
            "explanation": "4", "verified": True})
        assert q["type"] == "single_choice" and q["answer"] == 1

    def test_11_create_graph_analysis(self, admin):
        mid = self.media_id
        q = self._post(admin, {
            "type": "graph_analysis",
            "question": "TEST_ Определите знак производной по графику.",
            "options": ["Положительный", "Отрицательный", "Нулевой"],
            "answer": 0, "answer_format": "single_choice",
            "images": [{"media_id": mid, "url": f"/api/media/{mid}",
                        "caption": "график", "kind": "graph"}],
            "ege_task_number": "7", "explanation": "Растёт=>f'>0",
            "verified": True})
        assert q["images"][0]["media_id"] == mid
        assert q["ege_task_number"] == "7"
        type(self).graph_qid = q["id"]

    def test_12_create_matching(self, admin):
        q = self._post(admin, {
            "type": "matching",
            "question": "TEST_ Сопоставьте функции с производными",
            "match_left": ["sin x", "x^2", "e^x"],
            "match_right": ["2x", "cos x", "e^x"],
            "match_answer": [1, 0, 2], "verified": True})
        assert q["match_answer"] == [1, 0, 2]
        type(self).match_qid = q["id"]

    def test_13_create_ordering(self, admin):
        q = self._post(admin, {
            "type": "ordering", "question": "TEST_ Расставьте шаги",
            "order_items": ["A", "B", "C", "D"],
            "order_answer": [0, 1, 2, 3], "verified": True})
        assert q["order_answer"] == [0, 1, 2, 3]
        type(self).order_qid = q["id"]

    def test_14_create_table_completion(self, admin):
        q = self._post(admin, {
            "type": "table_completion", "question": "TEST_ Заполните пропуски",
            "table_headers": ["f(x)", "f'(x)"],
            "table_rows": [["sin x", "___"], ["x^2", "___"]],
            "table_answer": ["cos x", "2x"], "verified": True})
        assert q["table_answer"] == ["cos x", "2x"]
        type(self).table_qid = q["id"]

    def test_15_create_extended_response(self, admin):
        q = self._post(admin, {
            "type": "extended_response", "question": "TEST_ Докажите...",
            "scoring": {"max_score": 3,
                        "criteria": [
                            {"title": "решение", "description": "верно",
                             "required": True, "common_errors": []},
                            {"title": "обоснование", "description": "все шаги",
                             "required": False, "common_errors": []}]},
            "verified": False})
        assert q["scoring"]["max_score"] == 3
        assert len(q["scoring"]["criteria"]) == 2
        type(self).extended_qid = q["id"]

    def test_16_verify_toggle(self, admin):
        qid = self.extended_qid
        r = admin["session"].patch(
            f"{API}/admin/questions/{qid}/verify", json={"verified": True})
        assert r.status_code == 200
        assert r.json()["verified"] is True

    def test_17_filter_has_images(self, admin):
        r = admin["session"].get(
            f"{API}/admin/questions", params={"has_images": "true"})
        assert r.status_code == 200
        items = r.json()
        assert any(x["id"] == self.graph_qid for x in items)
        for it in items:
            assert it.get("images") and len(it["images"]) >= 1

    def test_18_filter_by_type(self, admin):
        r = admin["session"].get(
            f"{API}/admin/questions", params={"qtype": "matching"})
        assert r.status_code == 200
        items = r.json()
        assert all(it["type"] == "matching" for it in items)
        assert any(x["id"] == self.match_qid for x in items)

    def test_19_update_question(self, admin):
        qid = self.match_qid
        cur = next(x for x in admin["session"].get(
            f"{API}/admin/questions", params={"qtype": "matching"}).json()
            if x["id"] == qid)
        cur["question"] = "TEST_ обновлено"
        for k in ("id", "created_at", "source", "difficulty_level", "_id"):
            cur.pop(k, None)
        r = admin["session"].patch(f"{API}/admin/questions/{qid}", json=cur)
        assert r.status_code == 200, r.text
        assert r.json()["question"] == "TEST_ обновлено"

    # ---------- grading via /practice/answer ----------
    def test_20_practice_start_and_grade_all(self, student):
        # Start practice covering all our questions (topic-scoped, count=40)
        r = student["session"].post(f"{API}/practice/start", json={
            "subject_id": self.subject["id"], "topic_id": self.topic["topic_id"],
            "count": 40})
        assert r.status_code == 200, r.text
        session = r.json()
        sid = session["session_id"]
        qmap = {q["id"]: q for q in session["questions"]}

        # extended_response must be excluded from adaptive
        assert self.extended_qid not in qmap, \
            "extended_response leaked into adaptive practice"

        cases = [
            (self.match_qid, [1, 0, 2], True, "match_answer", [1, 0, 2]),
            (self.order_qid, [0, 1, 2, 3], True, "order_answer", [0, 1, 2, 3]),
            (self.table_qid, ["wrong", "2x"], False, "table_answer", ["cos x", "2x"]),
            (self.graph_qid, 0, True, None, None),
        ]
        for qid, ans, expected, echo_key, echo_val in cases:
            if qid not in qmap:
                pytest.fail(f"question {qid} was not returned by practice/start "
                            f"(topic filter or shuffling issue). Got "
                            f"{list(qmap.keys())[:5]}...")
            r = student["session"].post(f"{API}/practice/answer", json={
                "session_id": sid, "question_id": qid, "answer": ans})
            assert r.status_code == 200, r.text
            j = r.json()
            assert j["is_correct"] is expected, \
                f"grading wrong for {qid}: got {j}"
            if echo_key:
                assert j.get(echo_key) == echo_val, \
                    f"feedback missing {echo_key}"

        # verify graph task carries images to the client
        gq = qmap[self.graph_qid]
        assert gq["images"] and gq["images"][0]["url"].startswith("/api/media/")
        assert gq["answer_format"] == "single_choice"

    # ---------- cleanup ----------
    def test_zz_delete_all(self, admin):
        for qid in list(self.created_ids):
            r = admin["session"].delete(f"{API}/admin/questions/{qid}")
            assert r.status_code in (200, 404)
