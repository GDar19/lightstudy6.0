# LightStudy — PRD

## Original problem statement
Build a fully functional full-stack AI-powered EGE (ЕГЭ) preparation platform for Russian high-school
students (15–18). Not a mockup: real frontend + backend + DB + auth + diagnostic + knowledge profile +
personalized adaptive study plan + practice engine + progress tracking + AI tutor + mock exams + admin.
Russian UI. Clean modular, extensible architecture (future: more subjects, RAG, voice, visual lessons).

## User choices (confirmed)
- AI provider: **Claude Sonnet 4.6** (via Emergent universal key)
- Auth: **JWT email/password**
- Branding/mascot: **wizard character "Фили"** used as logo + AI avatar everywhere
- Content depth: **6 subjects** (Русский, Математика профиль, Физика, Информатика, Обществознание, Биология)
- Admin: **yes**, seeded admin account

## Architecture
- Frontend React (CRACO, Tailwind, shadcn, Recharts, Framer Motion), centralized axios client with 401 auto-refresh.
- Backend FastAPI, modular routers + `ai_service` + `logic` (deterministic scoring) + `seed`/`content_data`.
- MongoDB via Motor; docs keyed by uuid `id`; indexes on hot fields.
- Auth: bcrypt + JWT (httpOnly cookies + Bearer), brute-force lockout, admin RBAC.

## Personas
- **Student** (primary): diagnoses level, follows adaptive plan, practices, uses AI tutor.
- **Admin**: views platform stats/users, manages the question bank.

## Core requirements (static)
Continuous loop: diagnostic → knowledge profile → plan → lesson/practice → error analysis →
profile & difficulty update → next task. Real data only (zeros/empty states for new users).

## Implemented (2026-06)
- Auth: register/login/logout/refresh/me, JWT cookies, bcrypt, lockout, admin seed. ✅
- Onboarding (subject count, subjects, target score, exam date, daily time, confidence). ✅
- Subjects/sections/topics/lessons/textbooks content (6 subjects, ~70 questions, 6 lessons). ✅
- Diagnostic per subject → knowledge profile (deterministic mastery). Records attempts (idempotent finish). ✅
- Personalized study plan generation (weak-topic priority, activity types, preserves completed). ✅
- Practice engine with adaptive difficulty (rolling accuracy) + mistake capture/resolve. ✅
- Mistakes page + "повторить ошибки" practice mode. ✅
- Dashboard (countdown, real aggregates, today's tasks, weak topics). ✅
- Statistics (subject bar chart, progress-over-time line, weak topics, donut) — real data. ✅
- Mock exams (timer, navigator, submit, score + topic breakdown + review, feeds profile). ✅
- AI Tutor (real Claude): chat with history/context, quick actions, explain/generate/analyze; per-user rate limit; graceful fallback. ✅
- Textbooks mode ("Мои учебники") with AI explanations. ✅
- Achievements + in-app notifications. ✅
- Profile/settings edit with persistence; achievements display. ✅
- Admin panel: stats, users, question CRUD (subject/topic selects), RBAC-protected. ✅
- Landing / About / Privacy / Terms; responsive desktop/tablet/mobile (0 horizontal overflow verified). ✅

## Testing
- iteration_1: 36/37 backend, all frontend flows pass; real Claude confirmed.
- iteration_2: all regression fixes verified (mobile overflow=0, diagnostic stats, localized charts).

## Backlog (prioritized)
### P1
- RAG content ingestion (PDF/doc parsing → chunk → embeddings) behind existing content model.
- AI-generated practice questions surfaced in the Practice UI (endpoint exists).
- Spaced repetition scheduling for mastered topics.
### P2
- Voice tutor (STT/TTS), 2D visual lessons (lesson schema already extensible).
- Email/Telegram notifications (notification service is modular).
- Teacher/parent accounts, subscriptions/payments, classroom analytics.

## Known notes
- Seed content is demo/educational, not official EGE questions (labeled in UI/README).
- `days_until_exam` clamps to 0 for past dates.
