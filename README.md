# LightStudy — AI-powered EGE preparation platform

LightStudy is a full-stack platform that helps Russian high-school students prepare for the ЕГЭ.
It runs the full learning loop: **diagnostic → knowledge profile → personalized adaptive study plan →
lessons & practice → error analysis → profile/plan update**, with an integrated AI tutor ("Фили").

## Stack
- **Frontend**: React (CRA + CRACO), React Router, Tailwind, shadcn/ui, Recharts, Framer Motion, sonner
- **Backend**: FastAPI (modular routers + service layer), Motor (async MongoDB)
- **Database**: MongoDB (documents use a uuid `id` field, never the raw `_id`)
- **Auth**: JWT (httpOnly access + refresh cookies, Bearer fallback), bcrypt, brute-force lockout
- **AI**: Claude Sonnet 4.6 via `emergentintegrations` (provider-agnostic `AIService`)

## Architecture
```
backend/
  server.py            # app bootstrap, CORS, startup seed, mounts /api router
  db.py                # Mongo client + doc cleaners
  auth_utils.py        # hashing, JWT, get_current_user / require_admin
  ai_service.py        # provider-agnostic AIService (explain / question / analyze / chat / lesson)
  logic.py             # deterministic mastery, adaptive difficulty, plan generation, achievements
  content_data.py      # seed content: subjects, topics, questions, lessons, textbooks, achievements
  seed.py              # idempotent DB seed + indexes + admin account
  routes_*.py          # auth, user, content, diagnostic, plan, practice, mistakes,
                       # dashboard, ai, mock, admin
frontend/src/
  api/client.js        # centralized axios client (+ 401 auto-refresh)
  context/AuthContext  # session state
  components/          # AppLayout (sidebar+mobile nav), QuestionRunner, AIAnswer, common
  pages/               # Landing, Login, Register, Onboarding, Dashboard, StudyPlan,
                       # Subjects, SubjectDetail, TopicPage, LessonPage, Practice,
                       # MockExams, Mistakes, Statistics, Tutor, Textbooks, Profile, Admin,
                       # Diagnostic, DiagnosticResults
```

The AI service layer is decoupled from the UI so RAG / voice (STT-TTS) / visual lessons can be added later
without rewriting the tutor. Lesson documents already carry `formulas`/`examples`/`key_points` fields and can
be extended with diagram/scene metadata for future 2D visual lessons.

## Environment variables (`backend/.env`, see `.env.example`)
- `MONGO_URL`, `DB_NAME` — database
- `JWT_SECRET` — token signing secret
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — seeded admin account
- `EMERGENT_LLM_KEY` — universal key for the AI provider
- `AI_PROVIDER` (default `anthropic`), `AI_MODEL` (default `claude-sonnet-4-6`)

Frontend uses `REACT_APP_BACKEND_URL` only. Never hardcode secrets; the AI key stays server-side.

## Local development
Services are managed by supervisor.
- Backend: `sudo supervisorctl restart backend` (binds 0.0.0.0:8001, routes prefixed `/api`)
- Frontend: `sudo supervisorctl restart frontend` (port 3000)
- Seed content + admin run automatically on backend startup.

## Seed data
6 subjects (Русский, Математика профиль, Физика, Информатика, Обществознание, Биология) with sections,
topics, a demo question bank, interactive lessons and textbook materials. **This is demo/initial educational
content, not an official EGE question bank.**

## API (selected)
`/api/auth/{register,login,logout,refresh,me}`, `/api/onboarding`, `/api/profile`,
`/api/subjects[/{id}]`, `/api/topics/{id}`, `/api/lessons/{id}[/complete]`, `/api/textbooks`,
`/api/diagnostics/{start,{id}/answer,{id}/finish,{id}/results}`,
`/api/study-plan[/generate|/items/{id}]`, `/api/practice/{start,answer,{id}/finish}`,
`/api/mistakes[/retry]`, `/api/dashboard`, `/api/statistics`, `/api/progress`,
`/api/achievements`, `/api/notifications`, `/api/ai/{chat,explain,generate-question,analyze-answer,conversations}`,
`/api/mock-exams[/{start,{id}/finish}]`, `/api/admin/{stats,users,questions,topics}`.

## Extending the platform
- **New subject**: add an entry to `SUBJECTS` in `content_data.py` (id, name, icon, color, sections→topics).
- **New topic**: add it under a subject's section in `content_data.py`.
- **New questions**: add to `QUESTIONS` in `content_data.py`, or create them at runtime via the Admin panel.
- **New lesson**: add to `LESSONS` in `content_data.py`.
- **Replace the AI provider**: set `AI_PROVIDER`/`AI_MODEL` in `.env` (all logic lives in `ai_service.py`).

## Security notes
- Passwords hashed with bcrypt; JWT in httpOnly cookies; login lockout after repeated failures.
- Every user-owned query is scoped by `user_id`; admin endpoints require the admin role.
- AI endpoints are rate-limited per user and degrade gracefully to a friendly Russian message on provider errors.
