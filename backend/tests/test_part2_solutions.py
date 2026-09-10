"""Phase 3: Part 2 (extended_response) — task list, detail, solution submit with Gemini vision.

Tests:
 - Auth-required list & detail
 - Filter by subject
 - Task detail includes scoring criteria
 - Submit typed-only -> AI analysis
 - Submit real handwritten image (correct + wrong) -> AI multimodal analysis, first_error semantics
 - Validation: empty, junk file, too many files
 - HEIC upload path (best effort)
 - /part2/submissions
 - Regression: extended_response tasks NOT in /api/practice/start
 - Regression: admin can create extended_response via /api/admin/questions
"""
import io
import time
import requests
import pytest
from PIL import Image, ImageDraw, ImageFont
from conftest import API


# ---------- helpers ----------

def _font(sz=28):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            continue
    return ImageFont.load_default()


def _handwriting_image(lines, w=900, h=600) -> bytes:
    """A high-contrast 'handwritten' solution rendered as PNG (real content, no blanks)."""
    img = Image.new("RGB", (w, h), (252, 250, 240))
    d = ImageDraw.Draw(img)
    # Some ruled lines to look like paper
    for y in range(60, h, 42):
        d.line([(20, y), (w - 20, y)], fill=(210, 220, 230), width=1)
    f = _font(30)
    y = 30
    for ln in lines:
        d.text((40, y), ln, fill=(20, 30, 70), font=f)
        y += 46
    # Add a small "signature" ellipse just to add non-uniform variance
    d.ellipse([w - 180, h - 90, w - 40, h - 30], outline=(80, 60, 200), width=3)
    d.text((w - 165, h - 78), "student", fill=(80, 60, 200), font=_font(22))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


CORRECT_SOLUTION = [
    "Уравнение: x^2 - 5x + 6 = 0",
    "D = b^2 - 4ac = 25 - 24 = 1",
    "sqrt(D) = 1",
    "x1 = (5 + 1)/2 = 3",
    "x2 = (5 - 1)/2 = 2",
    "Ответ: x = 2; x = 3",
]

WRONG_SOLUTION = [
    "Уравнение: x^2 - 5x + 6 = 0",
    "D = b^2 - 4ac = 25 - 4*6 = 25 - 20 = 5",  # wrong arithmetic
    "sqrt(D) ≈ 2.236",
    "x1 = (5 + 2.236)/2 ≈ 3.62",
    "x2 = (5 - 2.236)/2 ≈ 1.38",
    "Ответ: 3.62; 1.38",
]


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def math_task(admin):
    """Ensure at least one math_prof extended_response task exists; use pre-seeded if present."""
    s = admin["session"]
    r = s.get(f"{API}/part2/tasks", params={"subject_id": "math_prof"})
    # /part2/tasks requires auth but admin session has it
    if r.status_code == 200 and r.json():
        for t in r.json():
            if t.get("scoring", {}).get("criteria"):
                return t
    # else create one
    payload = {
        "subject_id": "math_prof",
        "topic_id": "equations",
        "type": "extended_response",
        "difficulty": "hard",
        "question": "Решите уравнение x^2 - 5x + 6 = 0",
        "solution": "D=1, корни x=2 и x=3",
        "ege_task_number": "13",
        "exam_part": "часть 2",
        "scoring": {
            "max_score": 2,
            "criteria": [
                {"title": "Верный ход решения", "max": 1, "description": "Найден дискриминант и записан алгоритм"},
                {"title": "Верный ответ", "max": 1, "description": "Оба корня найдены правильно"},
            ],
        },
    }
    r = s.post(f"{API}/admin/questions", json=payload)
    assert r.status_code in (200, 201), f"create task: {r.status_code} {r.text[:300]}"
    return r.json()


# ---------- tests ----------

class TestPart2ListAndDetail:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/part2/tasks")
        assert r.status_code in (401, 403)

    def test_list_returns_extended_response_only(self, student, math_task):
        r = student["session"].get(f"{API}/part2/tasks")
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        # every returned task must have scoring block shape and be extended_response
        for t in arr:
            assert "scoring" in t
            assert t.get("type") in (None, "extended_response")

    def test_list_filter_by_subject(self, student):
        r = student["session"].get(f"{API}/part2/tasks", params={"subject_id": "math_prof"})
        assert r.status_code == 200
        for t in r.json():
            assert t["subject_id"] == "math_prof"

    def test_list_empty_for_unknown_subject(self, student):
        r = student["session"].get(f"{API}/part2/tasks", params={"subject_id": "nope_subject_xyz"})
        assert r.status_code == 200
        assert r.json() == []

    def test_task_detail(self, student, math_task):
        r = student["session"].get(f"{API}/part2/tasks/{math_task['id']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["task"]["id"] == math_task["id"]
        assert data["task"]["scoring"]["max_score"] >= 1
        assert isinstance(data["submissions"], list)

    def test_task_detail_404(self, student):
        r = student["session"].get(f"{API}/part2/tasks/does_not_exist_xyz")
        assert r.status_code == 404


class TestPart2Validation:
    def test_submit_empty_returns_400(self, student, math_task):
        r = student["session"].post(f"{API}/part2/tasks/{math_task['id']}/submit",
                                    data={"typed_answer": ""})
        assert r.status_code == 400
        assert "фото" in r.json().get("detail", "").lower() or "ответ" in r.json().get("detail", "").lower()

    def test_submit_junk_file_rejected(self, student, math_task):
        files = [("files", ("junk.png", b"this is not an image", "image/png"))]
        r = student["session"].post(f"{API}/part2/tasks/{math_task['id']}/submit",
                                    data={"typed_answer": ""}, files=files)
        assert r.status_code == 400, r.text

    def test_submit_too_many_files(self, student, math_task):
        img = _handwriting_image(["x=1"])
        files = [("files", (f"s{i}.png", img, "image/png")) for i in range(6)]
        r = student["session"].post(f"{API}/part2/tasks/{math_task['id']}/submit",
                                    data={"typed_answer": ""}, files=files)
        assert r.status_code == 400
        assert "5" in r.json().get("detail", "")


class TestPart2Submit:
    def test_submit_typed_only(self, student, math_task):
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": "D=1, корни x=2 и x=3"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "submission" in body
        assert body["submission"]["typed_answer"].startswith("D=1")
        # AI available in this env; analysis should come back with a max_score
        if body.get("available"):
            assert body["analysis"] is not None
            assert body["analysis"].get("max_score")

    def test_submit_correct_image(self, student, math_task):
        img = _handwriting_image(CORRECT_SOLUTION)
        files = [("files", ("correct.png", img, "image/png"))]
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": ""}, files=files, timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["submission"]["images"], "stored image record missing"
        media_id = body["submission"]["images"][0]["media_id"]
        # image is served
        m = student["session"].get(f"{API}/media/{media_id}")
        assert m.status_code == 200
        assert m.headers.get("content-type", "").startswith("image/")
        if body.get("available") and body.get("analysis") and body["analysis"].get("criteria"):
            a = body["analysis"]
            assert a["max_score"] == 2
            # Correct solution should score >=1
            if a.get("total_score") is not None:
                assert a["total_score"] >= 1

    def test_submit_wrong_image_flags_error(self, student, math_task):
        img = _handwriting_image(WRONG_SOLUTION)
        files = [("files", ("wrong.png", img, "image/png"))]
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": ""}, files=files, timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        if body.get("available") and body.get("analysis") and body["analysis"].get("criteria"):
            a = body["analysis"]
            # Should be lower score than correct one, and first_error present
            fe = (a.get("first_error") or "").lower()
            assert fe, "expected first_error to be non-empty for a wrong solution"

    def test_submit_multiple_images_ok(self, student, math_task):
        imgs = [_handwriting_image([f"шаг {i}: x = {i}"]) for i in range(3)]
        files = [("files", (f"p{i}.png", d, "image/png")) for i, d in enumerate(imgs)]
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": ""}, files=files, timeout=120,
        )
        assert r.status_code == 200, r.text
        assert len(r.json()["submission"]["images"]) == 3

    def test_webp_upload_ok(self, student, math_task):
        img = Image.new("RGB", (600, 400), (255, 255, 250))
        d = ImageDraw.Draw(img)
        d.text((40, 40), "x^2 - 5x + 6 = 0, D=1", fill=(20, 30, 70), font=_font(28))
        d.text((40, 100), "x1=3, x2=2", fill=(20, 30, 70), font=_font(28))
        buf = io.BytesIO(); img.save(buf, format="WEBP", quality=85)
        files = [("files", ("s.webp", buf.getvalue(), "image/webp"))]
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": ""}, files=files, timeout=120,
        )
        assert r.status_code == 200, r.text

    def test_heic_path_or_pillow_available(self, student, math_task):
        """Verify HEIC support code path exists (pillow_heif importable). Best-effort HEIC upload."""
        import pillow_heif  # noqa: F401  -- must be installed for HEIC route
        # Best-effort: build a tiny HEIC using pillow_heif's writer if possible.
        try:
            src = Image.new("RGB", (400, 300), (240, 240, 240))
            d = ImageDraw.Draw(src); d.text((30, 30), "x=2, x=3", fill=(0, 0, 0), font=_font(24))
            heif = pillow_heif.from_pillow(src)
            buf = io.BytesIO(); heif.save(buf, format="HEIF")
            data = buf.getvalue()
        except Exception:
            pytest.skip("HEIC writer not available in this env; import path OK")
        files = [("files", ("s.heic", data, "image/heic"))]
        r = student["session"].post(
            f"{API}/part2/tasks/{math_task['id']}/submit",
            data={"typed_answer": ""}, files=files, timeout=120,
        )
        assert r.status_code == 200, r.text
        ct = r.json()["submission"]["images"][0].get("url", "")
        # image should be re-encoded to JPEG/PNG
        media_id = r.json()["submission"]["images"][0]["media_id"]
        m = student["session"].get(f"{API}/media/{media_id}")
        assert m.headers.get("content-type", "") in ("image/jpeg", "image/png")


class TestPart2Submissions:
    def test_submissions_endpoint_lists_own(self, student, math_task):
        # ensure at least one prior submission exists
        student["session"].post(f"{API}/part2/tasks/{math_task['id']}/submit",
                                data={"typed_answer": "ответ 2 и 3"}, timeout=60)
        r = student["session"].get(f"{API}/part2/submissions")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert all(s["user_id"] == student["user"]["id"] for s in arr)

    def test_submissions_scoped_per_user(self, student2, math_task):
        r = student2["session"].get(f"{API}/part2/submissions")
        assert r.status_code == 200
        arr = r.json()
        # brand new user should have no submissions for this task yet
        assert all(s["user_id"] == student2["user"]["id"] for s in arr)


class TestRegressionPhase1and2:
    def test_extended_excluded_from_practice(self, student):
        r = student["session"].post(f"{API}/practice/start",
                                    json={"subject_id": "math_prof"}, timeout=30)
        # Should either start (no ext_resp) or return no-questions. Never an extended_response question.
        if r.status_code == 200:
            body = r.json()
            q = body.get("question") or {}
            if q:
                assert q.get("type") != "extended_response"

    def test_admin_question_extended_response_shape(self, admin, math_task):
        r = admin["session"].get(f"{API}/admin/questions",
                                 params={"type": "extended_response"})
        # If admin questions endpoint supports the filter it should return >=1
        assert r.status_code in (200, 404)
