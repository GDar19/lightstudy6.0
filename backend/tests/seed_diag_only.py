"""Seed a brand-new account that completes ONLY a diagnostic (no practice) for stats regression check."""
import time
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
EMAIL = f"qa_diag_{int(time.time())}@ls.ru"
PWD = "test123"

s = requests.Session()
r = s.post(f"{BASE}/auth/register", json={"name": "QA Диаг", "email": EMAIL, "password": PWD})
print("register", r.status_code)
token = r.json().get("access_token") or r.json().get("token")
if token:
    s.headers.update({"Authorization": f"Bearer {token}"})

r = s.post(f"{BASE}/onboarding", json={"subjects": ["math_prof"], "target_score": 90,
                                       "exam_date": "2027-06-01", "daily_minutes": 60,
                                       "study_days": ["mon", "tue", "wed"], "confidence": "medium"})
print("onboarding", r.status_code)

r = s.post(f"{BASE}/diagnostics/start", json={"subject_id": "math_prof"})
print("diag start", r.status_code)
d = r.json()
did = d["diagnostic_id"]
for i, q in enumerate(d["questions"]):
    ans = i % len(q["options"])
    rr = s.post(f"{BASE}/diagnostics/{did}/answer", json={"question_id": q["id"], "answer": ans})
    assert rr.status_code == 200, rr.text
print("answered", len(d["questions"]))
r = s.post(f"{BASE}/diagnostics/{did}/finish")
print("finish", r.status_code, r.json())

dash = s.get(f"{BASE}/dashboard").json()
print("DASHBOARD:", {k: v for k, v in dash.items() if not isinstance(v, (list, dict))})
print("tasks_completed:", dash.get("tasks_completed"), "accuracy:", dash.get("accuracy"))
st = s.get(f"{BASE}/statistics").json()
print("STATS keys:", list(st.keys()))
print("progress_over_time len:", len(st.get("progress_over_time", [])))
print("\nCREDENTIALS:", EMAIL, PWD)
