"""Regression: after POST /lessons/{id}/complete the lesson GET should report a completed status
so the UI can show 'Завершён · можно повторить'."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
API = BASE_URL + "/api"


@pytest.fixture(scope="module")
def student():
    s = requests.Session()
    email = f"TEST_lc_{uuid.uuid4().hex[:10]}@ls.ru"
    r = s.post(f"{API}/auth/register", json={"name": "TEST LC", "email": email, "password": "test123"})
    assert r.status_code == 200, r.text[:300]
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    s.post(f"{API}/onboarding", json={"subjects": ["math_prof"], "goal_score": 80,
                                      "exam_date": "2027-06-01", "hours_per_week": 8})
    return s


def test_status_after_complete(student):
    lessons = student.get(f"{API}/topics/derivative").json()["lessons"]
    lid = lessons[0]["id"]
    assert student.post(f"{API}/lessons/{lid}/complete").status_code == 200
    lesson = student.get(f"{API}/lessons/{lid}").json()
    assert lesson.get("status") == "completed", (
        f"lesson status after /complete is '{lesson.get('status')}' — UI cannot show "
        "'Завершён · можно повторить' after a reload")
