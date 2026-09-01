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

## Verification round (2026-06) — Admin + Knowledge Base (RAG)
- E2E frontend test PASSED 100%: admin login, /app/admin route, all 5 tabs, «База знаний» tab, PDF upload → GridFS → text extraction → chunking → «Проиндексирован», TF-IDF semantic search, reprocess, delete.
- Confirmed backend playbook auth: bcrypt $2b$, httpOnly access+refresh cookies, cookie-only /api/auth/me, 5-fail lockout, valid seed admin.
- Polish fixes applied to KnowledgeBase.jsx: delete confirmation dialog, delete/poll race guard (removedRef), Russian pluralization (1 фрагмент/страница), data-testid on search subject select.
- Admin creds: admin@lightstudy.ru / admin123. KB is a TAB in /app/admin, not a route.

### Findings surfaced to user (not yet actioned — need decision)
- **RAG reaches only generate-question**: uploaded textbooks feed `POST /api/ai/generate-question` but NOT the Fili tutor chat / explain-topic. To make textbooks influence the main AI answers, wire `kb_service.retrieve` into those endpoints. (P1)
- **Scalability**: TF-IDF refit per query, 2000-chunk cap in retrieve(), sync PDF parsing on event loop, one-by-one chunk inserts — fine for demo, will not scale to real 400-page textbooks. (P1)
- **CORS**: allow_origin_regex='.*' + credentials works only same-host; restrict to explicit origins for prod. (P2)
- For RAG demos use a Cyrillic PDF (`/app/test_reports/sample_derivative_ru.pdf`); the Latin-transliteration sample returns 0 hits since TF-IDF is purely lexical.

## Enhancement round 2 (2026-06)
- **12 EGE subjects** (added Математика база, Химия, История, География, Английский, Литература); admin can enable/disable each.
- **Harder EGE-level question bank** with multi-step tasks, typical traps, `hint`, `exam_part`, `tags`.
- **Multiple answer types**: single_choice, multiple_choice, true_false, numeric, text — graded server-side (`grader.py`, tolerant to `0,24`≈`0.24`, case/space/order).
- **Recalibrated mastery** (`compute_mastery`): difficulty-weighted, volume-scaled, ceiling by hardest level attempted — no more instant 100%; lessons contribute via graded tasks, not completion alone.
- **Interactive lessons**: answer fields + «Проверить», persisted answers/status, re-openable after completion, per-task «Фили, объясни» with lesson/problem context.
- **Practice selectors**: subject/topic/difficulty/count. **Mock exams** harder (15 q / 40 min, hard/ege bias) with all answer types.
- **Contextual, hint-first Фили** (no LaTeX leakage; client-side LaTeX cleanup fallback).
- Admin: subject enable/disable + question type/hint/exam_part/answer_value editing.
- Verified: backend 58/58 pytest; frontend flows pass. Fixed post-test bugs: lesson completion status, contextual-Фили double-send (StrictMode), ill-posed parametric question, hint-first behavior + LaTeX rendering.
