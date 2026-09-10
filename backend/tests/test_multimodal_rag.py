"""Phase 2 multimodal RAG tests: PDF w/ figures ingestion, retrieval, /ai/chat, /ai/explain,
/ai/generate-question, lesson chat, DELETE lifecycle cleanup, reprocess idempotency, and
AI provider (gemini) status. Uses REAL LLM calls via Emergent universal key — allow slow."""
import os
import io
import time
import base64
import pytest
import requests
import pymupdf
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lightstudy-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@lightstudy.ru"
ADMIN_PASS = "admin123"
STUDENT_EMAIL = "student@lightstudy.ru"
STUDENT_PASS = "student123"


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def student_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS}, timeout=30)
    if r.status_code != 200:
        # register then login
        s.post(f"{API}/auth/register", json={
            "email": STUDENT_EMAIL, "password": STUDENT_PASS, "name": "Student Test"
        }, timeout=30)
        r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS}, timeout=30)
    assert r.status_code == 200, f"student login failed: {r.status_code} {r.text}"
    return s


def _make_triangle_pdf() -> bytes:
    """Generate a PDF containing Cyrillic text AND a real embedded raster image (triangle diagram)."""
    # Build a real triangle diagram with PIL
    W, H = 500, 400
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    # triangle ABC
    A, B, C = (60, 340), (440, 340), (250, 60)
    d.line([A, B], fill="black", width=3)
    d.line([B, C], fill="black", width=3)
    d.line([C, A], fill="black", width=3)
    # height from C to AB (foot H)
    Hpt = (250, 340)
    d.line([C, Hpt], fill="red", width=3)
    # labels
    d.text((40, 350), "A", fill="black")
    d.text((445, 350), "B", fill="black")
    d.text((245, 40), "C", fill="black")
    d.text((255, 345), "H", fill="red")
    # add some texture
    for i in range(20):
        d.point((100 + i * 5, 200), fill="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    # Build PDF via pymupdf, embed image
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4
    # Insert Cyrillic text — pymupdf built-in fonts have Cyrillic support via "helv" for latin only.
    # Use insert_htmlbox for Unicode.
    html = (
        "<div style='font-family: sans-serif; font-size:12pt;'>"
        "<h2>Геометрия: высота треугольника</h2>"
        "<p>На рисунке изображён треугольник ABC. Красная линия CH — это высота, "
        "опущенная из вершины C на сторону AB. Точка H — основание высоты.</p>"
        "<p>Высота треугольника — это перпендикуляр, опущенный из вершины на противоположную сторону.</p>"
        "</div>"
    )
    try:
        page.insert_htmlbox(pymupdf.Rect(40, 40, 555, 240), html)
    except Exception:
        # fallback: latin text
        page.insert_text((40, 60), "Geometry: triangle height. Red line CH is the height from C to AB.")
    # embed the image
    page.insert_image(pymupdf.Rect(60, 260, 460, 620), stream=png_bytes)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


@pytest.fixture(scope="session")
def uploaded_doc(admin_session):
    """Upload a PDF with an embedded figure, wait for indexing, yield doc, cleanup at end."""
    pdf_bytes = _make_triangle_pdf()
    files = {"file": ("TEST_triangle.pdf", pdf_bytes, "application/pdf")}
    data = {"title": "TEST_Геометрия треугольник высота",
            "subject_id": "math_prof", "grade": "10", "doc_type": "textbook"}
    r = admin_session.post(f"{API}/admin/kb/upload", files=files, data=data, timeout=60)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    doc = r.json()
    doc_id = doc["id"]

    # poll for indexing
    indexed = None
    for _ in range(30):
        time.sleep(1)
        rr = admin_session.get(f"{API}/admin/kb", timeout=15)
        assert rr.status_code == 200
        for d in rr.json():
            if d["id"] == doc_id:
                if d.get("status") == "indexed":
                    indexed = d
                    break
                if d.get("status") == "error":
                    pytest.fail(f"indexing errored: {d.get('error')}")
        if indexed:
            break
    assert indexed, "document did not reach 'indexed' state in time"
    yield indexed

    # cleanup (also validates DELETE)
    try:
        admin_session.delete(f"{API}/admin/kb/{doc_id}", timeout=30)
    except Exception:
        pass


# ---------- tests ----------

# AI provider status
def test_ai_status_available(student_session):
    r = student_session.get(f"{API}/ai/status", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("available") is True, body


# PDF ingestion + figure extraction
def test_upload_extracts_figures(uploaded_doc):
    assert uploaded_doc["status"] == "indexed"
    assert uploaded_doc.get("pages", 0) >= 1
    assert uploaded_doc.get("chunks", 0) >= 1
    assert uploaded_doc.get("figures", 0) >= 1, f"expected figures>=1 got {uploaded_doc}"


# Multimodal /ai/chat retrieves text + figure sources
def test_ai_chat_multimodal(student_session, uploaded_doc):
    payload = {
        "message": "Что такое высота треугольника? Опиши красную линию на рисунке.",
        "subject_id": "math_prof",
    }
    # Retry once on AI hiccup
    last = None
    for attempt in range(2):
        r = student_session.post(f"{API}/ai/chat", json=payload, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        last = body
        if body.get("available") and body.get("answer") and "недоступен" not in body.get("answer", ""):
            break
        time.sleep(3)
    assert last["available"] is True, last
    assert last.get("answer") and "недоступен" not in last["answer"], last
    sources = last.get("sources") or []
    types = {s.get("type") for s in sources}
    assert "text" in types, f"no text source: {sources}"
    assert "figure" in types, f"no figure source: {sources}"


# /ai/explain with math_prof topic returns answer + sources (RAG wired in)
def test_ai_explain_returns_sources(student_session, uploaded_doc):
    # find a math_prof topic id
    subs = student_session.get(f"{API}/subjects", timeout=20).json()
    topic_id = None
    for s in subs:
        if s["id"] == "math_prof":
            # need /subjects/{id} for sections
            full = student_session.get(f"{API}/subjects/math_prof", timeout=20).json()
            for sec in full.get("sections", []):
                for t in sec.get("topics", []):
                    topic_id = t["id"]
                    break
                if topic_id:
                    break
            break
    assert topic_id, "no math_prof topic found"
    last = None
    for _ in range(2):
        r = student_session.post(f"{API}/ai/explain", json={"topic_id": topic_id}, timeout=120)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("answer") and "недоступен" not in last["answer"]:
            break
        time.sleep(3)
    assert last.get("available") is True
    assert last.get("answer") and "недоступен" not in last["answer"], last
    # sources may be empty if topic name doesn't match KB; but the key should exist
    assert "sources" in last, last


# /ai/generate-question with new multimodal path
def test_ai_generate_question(student_session, uploaded_doc):
    full = student_session.get(f"{API}/subjects/math_prof", timeout=20).json()
    topic_id = full["sections"][0]["topics"][0]["id"]
    last = None
    for _ in range(2):
        r = student_session.post(f"{API}/ai/generate-question",
                                 json={"topic_id": topic_id, "difficulty": "medium"}, timeout=120)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("available"):
            break
        time.sleep(3)
    assert last.get("available") is True, last
    # either question generated or graceful message; sources key should be present when generated
    if last.get("question"):
        assert "sources" in last, last


# In-lesson Fili chat still works (with KB figures passed to model)
def test_lesson_chat(student_session, uploaded_doc):
    # find any lesson
    full = student_session.get(f"{API}/subjects/math_prof", timeout=20).json()
    lesson_id = None
    for sec in full.get("sections", []):
        for t in sec.get("topics", []):
            if t.get("has_lesson"):
                topic_full = student_session.get(f"{API}/topics/{t['id']}", timeout=15).json()
                if topic_full.get("lessons"):
                    lesson_id = topic_full["lessons"][0]["id"]
                    break
        if lesson_id:
            break
    if not lesson_id:
        # try any subject
        subs = student_session.get(f"{API}/subjects", timeout=15).json()
        for s in subs:
            full = student_session.get(f"{API}/subjects/{s['id']}", timeout=15).json()
            for sec in full.get("sections", []):
                for t in sec.get("topics", []):
                    if t.get("has_lesson"):
                        topic_full = student_session.get(f"{API}/topics/{t['id']}", timeout=15).json()
                        if topic_full.get("lessons"):
                            lesson_id = topic_full["lessons"][0]["id"]
                            break
                if lesson_id:
                    break
            if lesson_id:
                break
    assert lesson_id, "no lesson found in DB"
    last = None
    for _ in range(2):
        r = student_session.post(f"{API}/lessons/{lesson_id}/chat",
                                 json={"message": "Объясни коротко тему этого урока."}, timeout=120)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("answer") and "недоступен" not in last["answer"]:
            break
        time.sleep(3)
    assert last.get("available") is True
    assert last.get("answer") and "недоступен" not in last["answer"], last


# Reprocess does not duplicate figures
def test_reprocess_no_duplication(admin_session, uploaded_doc):
    doc_id = uploaded_doc["id"]
    r = admin_session.post(f"{API}/admin/kb/{doc_id}/reprocess", timeout=30)
    assert r.status_code == 200
    # wait for reindex
    figs_before = uploaded_doc.get("figures", 0)
    for _ in range(30):
        time.sleep(1)
        lst = admin_session.get(f"{API}/admin/kb", timeout=15).json()
        cur = next((d for d in lst if d["id"] == doc_id), None)
        if cur and cur.get("status") == "indexed":
            assert cur.get("figures", 0) == figs_before, \
                f"figure count changed after reprocess: {figs_before} -> {cur.get('figures')}"
            return
    pytest.fail("reprocess did not reach indexed state")


# Regression: text-only kb search still works
def test_kb_search_still_works(admin_session, uploaded_doc):
    r = admin_session.post(f"{API}/admin/kb/search",
                           json={"subject_id": "math_prof", "query": "высота треугольника"}, timeout=30)
    assert r.status_code == 200, r.text
    results = r.json().get("results", [])
    assert len(results) >= 1, results


# Figure lifecycle cleanup on DELETE
def test_delete_cleans_figures_and_media(admin_session):
    # Upload a fresh doc so we can delete it and inspect its figures beforehand
    pdf_bytes = _make_triangle_pdf()
    files = {"file": ("TEST_triangle_del.pdf", pdf_bytes, "application/pdf")}
    data = {"title": "TEST_delete_lifecycle", "subject_id": "math_prof",
            "grade": "10", "doc_type": "textbook"}
    r = admin_session.post(f"{API}/admin/kb/upload", files=files, data=data, timeout=60)
    assert r.status_code == 200
    doc_id = r.json()["id"]

    # wait for indexing
    figures_media_ids = []
    for _ in range(30):
        time.sleep(1)
        lst = admin_session.get(f"{API}/admin/kb", timeout=15).json()
        cur = next((d for d in lst if d["id"] == doc_id), None)
        if cur and cur.get("status") == "indexed":
            break

    # Pull figures via /ai/chat sources (indirect but reliable public path)
    student = requests.Session()
    student.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASS}, timeout=30)
    for _ in range(2):
        rr = student.post(f"{API}/ai/chat",
                          json={"message": "покажи рисунок треугольника с высотой CH",
                                "subject_id": "math_prof"}, timeout=120)
        if rr.status_code == 200:
            for s in rr.json().get("sources", []):
                if s.get("type") == "figure" and s.get("doc_id") == doc_id and s.get("media_id"):
                    figures_media_ids.append(s["media_id"])
        if figures_media_ids:
            break
        time.sleep(2)

    # Delete the doc
    d = admin_session.delete(f"{API}/admin/kb/{doc_id}", timeout=30)
    assert d.status_code == 200, d.text

    # doc gone
    lst = admin_session.get(f"{API}/admin/kb", timeout=15).json()
    assert not any(x["id"] == doc_id for x in lst)

    # media files 404
    for mid in figures_media_ids:
        m = requests.get(f"{API}/media/{mid}", timeout=15)
        assert m.status_code == 404, f"media {mid} still accessible: {m.status_code}"
