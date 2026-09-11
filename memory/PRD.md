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

## Plan lessons + Fili placement (2026-06) — targeted change ✅ (self-tested)
- `StudyPlan.jsx`: plan items of type "Урок" now show a **«Начать урок»** button that opens the real lesson (resolves the topic's lesson via `api.topic`, navigates to `/app/lessons/:id`); non-lesson items keep «Начать» → practice.
- `seed.py`: auto-seeds one lesson for **every topic** lacking one (reusing real published bank questions as mini-questions + explanations), so all plan "Урок" activities open a working lesson through the existing lesson system.
- `TopicPage.jsx`: removed the top **«Фили объяснит»** button (and its now-unreachable explain UI); «Практика» stays.
- Fili remains only inside lessons (`LessonPage` «Фили объяснит» → full `/app/tutor` chat with lesson context, unchanged).
- Tests: TEST1 (6 «Начать урок» buttons), TEST2 (opens real lesson), TEST3 (topic top Fili removed), TEST4 (lesson Fili → tutor with context), TEST5 (no regressions) — all pass.

## Admin-controlled task bank (2026-06) — Phase 5 ✅ (iteration_10, backend 19/19, all 7 acceptance tests pass)
Core principle enforced: **ADMIN CREATES → VERIFIES → PUBLISHES → STUDENT SOLVES**. AI never creates/publishes bank tasks (kept disabled for future use).

### Changed files
- Backend: `routes_admin.py` (QuestionIn +subtopic/source/status; `_validate_publish`; new `/admin/questions/stats`, `/status`, `/duplicate`; list filters+search+sort), `routes_practice.py` (removed AI smart top-up; query `status:published`; friendly empty msg; `generate_and_store_tasks` kept but never called), `routes_diagnostic.py` & `routes_mock.py` (published-only), `seed.py` (idempotent core seeding, status default published, migration archiving ai_generated tasks), `content_data.py` (Стереометрия topic + 4 seed Qs), `routes_diagnostic.py`/`routes_mock.py` strip_answer include images (earlier fix).
- Frontend: `AdminTasks.jsx` (stats panel, status workflow draft/verification/published/archived, subtopic/source/status fields, search/sort/status filters, duplicate/publish/archive), `Practice.jsx` (AI toggle removed), `LessonPage.jsx` (embedded Fili chat removed → `openFili()` navigates to `/app/tutor` with lesson context auto-sent), `common.jsx` (shared `TaskImages`), `MockExams.jsx`/`LessonPage.jsx` (task images), `api/client.js` (setQuestionStatus/duplicateQuestion/questionStats).

### Behavior
- Task status workflow with publish validation (can't publish without required fields). Bank stats for admins. Стереометрия live in practice/admin/filters/stats. AI-generated Phase-4 tasks migrated to `archived` (hidden from students). Practice/Diagnostic/Mock serve published only; clear empty message instead of AI fallback. Lesson "Фили объяснит" opens the full AI chat with context (no embedded mini-chat).
- Known minor (not fixed, non-blocking): AdminTasks single_choice `answer` defaults to 0, so publishing without explicitly picking a correct option submits answer=0 (data-quality nicety, MEDIUM).

## Multimodal upgrade (2026-06) — Phases 1–4 (all tested & passing)
User choices: **Gemini vision** (gemini-3-flash-preview) via Emergent Universal Key, reuse **GridFS** for images, **HEIC** supported (pillow_heif), preserve existing UI.

### Phase 1 — Image-based tasks + all task types + admin task manager ✅ (iteration_5, 17/17 backend)
- `media_service.py` (GridFS bucket 'media', normalize/resize/HEIC→JPEG) + `routes_media.py` (`/admin/media/upload`, `/media/upload`, public `GET /media/{id}`).
- Expanded `questions` schema: images[], all task types (single/multiple/true_false/numeric/text/matching/ordering/table_completion/graph_analysis/diagram_analysis/image_analysis/extended_response), ege_task_number, solution, scoring criteria, source traceability, verified, ai_generated.
- `grader.py` grades matching/ordering/table_completion/analysis; extended_response is not auto-graded (Part 2 flow).
- Admin `AdminTasks.jsx` (filters, create/edit/preview/verify/delete, image upload). `QuestionRunner.jsx` renders task images + new types. Extended_response excluded from adaptive practice.

### Phase 2 — Multimodal RAG ✅ (iteration_6, 47/47 backend)
- `kb_service.py` now uses **pymupdf**: extracts page text + figures, stores figures in GridFS, records `kb_figures` linked by page; `retrieve_multimodal` returns text snippets + figures + base64. Subject-scoped. Figure cleanup on delete/reprocess.
- `ai_service.py` switched to Gemini vision; `_ask` accepts images (ImageContent). RAG (text+images) wired into `/ai/chat`, `/ai/explain`, `/ai/generate-question`, and in-lesson Fili chat. Responses return `sources`. Verified live: Gemini reads KB figures.

### Phase 3 — Extended-response (Part 2) + handwriting analysis + EGE criteria ✅ (iteration_7, 19/19 backend)
- `solution_analysis.py` (subject-aware, per-criterion, first-error detection, AI-assisted score, clearly non-official) via Gemini multimodal.
- `routes_solution.py`: `/part2/tasks`, `/part2/tasks/{id}`, `POST /part2/tasks/{id}/submit` (multipart typed_answer + up to 5 photos, HEIC ok), `/part2/submissions`.
- `Part2.jsx` page + `nav-part2`: browse tasks, "Загрузить решение" upload, per-criterion analysis view, past attempts.

### Phase 4 — Hybrid dynamic AI task generation ✅ (iteration_8, 9/9 backend)
- `routes_practice.generate_and_store_tasks`: smart practice generates EGE-level KB-grounded tasks via Gemini, validates, persists to `questions` (ai_generated=true, verified=false) with **source traceability** (doc, page, retrieved context). `start_practice` tops up existing tasks with generated ones (hybrid, cap 5).
- Practice `smart` toggle ("Добавить задания от ИИ"). Admin sees AI tasks (filter + preview source block). Mastery unchanged (difficulty-weighted, graded-attempts only).

### Known backlog after this upgrade (P1/P2)
- Scalability: PDF/image processing runs in a BackgroundTask on the event loop (offload via asyncio.to_thread); TF-IDF refit per query + 4000-chunk cap (move to embeddings/vector index for large libraries).
- CORS wildcard+credentials (restrict to explicit origins for prod).
- TF-IDF is lexical only — Russian paraphrase recall limited without dense embeddings.

## Earlier findings surfaced to user (KB verification round)
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
