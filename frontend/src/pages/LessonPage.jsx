import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronRight, Check, X, CheckCircle2, Dumbbell, Sparkles, Lightbulb, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader, Wizard, TaskImages } from "@/components/common";

function InteractiveTask({ lessonId, task, index, prior, onAskFili }) {
  const isChoice = task.type === "single_choice" || task.type === "true_false";
  const [sel, setSel] = useState(prior ? prior.answer : (isChoice ? null : ""));
  const [feedback, setFeedback] = useState(prior ? { is_correct: prior.is_correct } : null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async (answer) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.lessonTaskAnswer(lessonId, { task_index: index, answer });
      setFeedback(data);
    } catch { toast.error("Ошибка проверки"); } finally { setBusy(false); }
  };

  const askFili = () => onAskFili("Помоги разобраться с этим заданием: " + task.prompt, index);

  return (
    <div className="ls-card p-5" data-testid={`interactive-task-${index}`}>
      <div className="font-medium text-[#1E2A4A] mb-3">{task.prompt}</div>
      <TaskImages images={task.images} className="mb-3 mt-0" />
      {isChoice ? (
        <div className="space-y-2">
          {task.options.map((o, i) => {
            let cls = "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#E7D5A2]";
            if (feedback) {
              if (i === task.answer) cls = "border-[#10B981] bg-[#ECFDF5]";
              else if (i === sel) cls = "border-[#EF4444] bg-[#FEE2E2]";
            } else if (i === sel) cls = "border-[#B0862A] bg-[#F6EFDA]";
            return (
              <button key={i} disabled={!!feedback} onClick={() => { setSel(i); check(i); }} data-testid={`task-${index}-option-${i}`}
                className={`w-full text-left p-3 rounded-xl border-2 text-sm transition-all ${cls}`}>{o}</button>
            );
          })}
        </div>
      ) : (
        !feedback ? (
          <div className="flex gap-2">
            <input value={sel} onChange={(e) => setSel(e.target.value)} data-testid={`task-${index}-input`}
              placeholder={task.type === "numeric" ? "Введите число" : "Введите ответ"}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]" />
            <button onClick={() => sel && String(sel).trim() && check(sel)} data-testid={`task-${index}-check`} className="btn-accent">Проверить</button>
          </div>
        ) : (
          <div className="text-sm text-[#4B5563]">Твой ответ: <span className="font-semibold">{String(sel)}</span></div>
        )
      )}

      {!feedback && task.hint && (
        <div className="mt-3">
          <button onClick={() => setHint((h) => !h)} className="inline-flex items-center gap-1.5 text-sm text-[#F59E0B] hover:underline">
            <Lightbulb className="w-4 h-4" /> Подсказка
          </button>
          {hint && <p className="text-sm text-[#4B5563] mt-2 p-3 rounded-xl bg-[#FEF3C7]">{task.hint}</p>}
        </div>
      )}

      {feedback && (
        <div className="mt-3">
          <div className={`p-3 rounded-xl text-sm ${feedback.is_correct ? "bg-[#ECFDF5] text-[#10B981]" : "bg-[#FEF3C7] text-[#1E2A4A]"}`}>
            {feedback.is_correct ? "✓ Верно!" : "✗ Не совсем."} {feedback.explanation || task.explanation}
          </div>
          <button onClick={askFili} data-testid={`task-${index}-ask-fili`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#B0862A] hover:underline">
            <Sparkles className="w-4 h-4" /> Фили, объясни
          </button>
        </div>
      )}
    </div>
  );
}

function MiniQuestion({ q, index }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="ls-card p-5" data-testid={`mini-question-${index}`}>
      <div className="font-medium text-[#1E2A4A] mb-3">{q.question}</div>
      <TaskImages images={q.images} className="mb-3 mt-0" />
      <div className="space-y-2">
        {q.options.map((o, i) => {
          let cls = "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#E7D5A2]";
          if (sel != null) {
            if (i === q.answer) cls = "border-[#10B981] bg-[#ECFDF5]";
            else if (i === sel) cls = "border-[#EF4444] bg-[#FEE2E2]";
            else cls = "border-[#E5DEC9] opacity-60";
          }
          return (
            <button key={i} disabled={sel != null} onClick={() => setSel(i)}
              className={`w-full flex items-center gap-2 p-3 rounded-xl border-2 text-left text-sm transition-all ${cls}`}>
              <span className="text-[#1E2A4A]">{o}</span>
              {sel != null && i === q.answer && <Check className="w-4 h-4 text-[#10B981] ml-auto" />}
              {sel != null && i === sel && i !== q.answer && <X className="w-4 h-4 text-[#EF4444] ml-auto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    api.lesson(id).then(({ data }) => setLesson(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  // Open the full-featured Fili AI chat with the current lesson context auto-loaded.
  const openFili = (extra) => {
    if (!lesson) return;
    const base = `Я сейчас изучаю тему: «${lesson.title}» (урок платформы LightStudy).`;
    const tail = extra || "Объясни мне эту тему простым языком и помоги разобраться с текущим материалом.";
    const msg = `${base} ${tail}`;
    navigate(`/app/tutor?topic=${lesson.topic_id}&lesson=${id}&q=${encodeURIComponent(msg)}`);
  };

  const replayTasks = () => {
    setReplayKey((k) => k + 1);
    setLesson((l) => ({ ...l, prior_answers: {} }));
    toast.success("Задания сброшены — можно решить заново");
  };

  const complete = async () => {
    try {
      await api.completeLesson(id);
      setCompleted(true);
      toast.success("Урок завершён!");
    } catch { toast.error("Ошибка"); }
  };

  if (loading) return <Loader full />;
  if (!lesson) return null;

  return (
    <div className="animate-fade-up max-w-3xl">
      <nav className="flex items-center gap-1.5 text-sm text-[#8A94A6] mb-4">
        <Link to={`/app/subjects/${lesson.subject_id}`} className="hover:text-[#1E2A4A]">Предмет</Link>
        <ChevronRight className="w-4 h-4" />
        <Link to={`/app/topics/${lesson.topic_id}`} className="hover:text-[#1E2A4A]">Тема</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[#1E2A4A] font-medium">{lesson.title}</span>
      </nav>

      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">{lesson.title}</h1>
      <div className="flex items-center gap-3 mt-1 mb-6">
        <span className="text-sm text-[#8A94A6]">{lesson.duration} мин</span>
        {(completed || lesson.status === "completed") && (
          <span className="text-xs font-semibold text-[#10B981] bg-[#ECFDF5] px-2.5 py-1 rounded-full">Завершён · можно повторить</span>
        )}
        {lesson.status === "in_progress" && !completed && (
          <span className="text-xs font-semibold text-[#F59E0B] bg-[#FEF3C7] px-2.5 py-1 rounded-full">В процессе</span>
        )}
        <button onClick={() => openFili()}
          data-testid="lesson-ask-fili-btn" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B0862A] hover:underline ml-auto">
          <Sparkles className="w-4 h-4" /> Фили объяснит
        </button>
      </div>

      {/* Explanation */}
      <section className="ls-card p-6 mb-5">
        <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Объяснение</h2>
        <p className="text-[#4B5563] leading-relaxed">{lesson.explanation}</p>
        {lesson.key_points?.length > 0 && (
          <ul className="mt-4 space-y-2">
            {lesson.key_points.map((k, i) => (
              <li key={i} className="flex gap-2 text-[#1E2A4A]"><Check className="w-4 h-4 text-[#B0862A] mt-1 shrink-0" /> {k}</li>
            ))}
          </ul>
        )}
        {lesson.formulas?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lesson.formulas.map((f, i) => (
              <span key={i} className="font-mono text-sm px-3 py-1.5 rounded-lg bg-[#182238] text-[#E7D5A2]">{f}</span>
            ))}
          </div>
        )}
      </section>

      {/* Examples */}
      {lesson.examples?.length > 0 && (
        <section className="ls-card p-6 mb-5">
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Примеры</h2>
          <div className="space-y-3">
            {lesson.examples.map((e, i) => (
              <div key={i} className="p-4 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
                <div className="text-[#1E2A4A]">{e.text}</div>
                <div className="font-mono text-sm text-[#B0862A] mt-1.5">→ {e.solution}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Interactive tasks (graded + saved) */}
      {lesson.interactive_tasks?.length > 0 && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">Интерактивные задания</h2>
            <button onClick={replayTasks} data-testid="replay-tasks-btn" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B0862A] hover:underline">
              <RotateCcw className="w-3.5 h-3.5" /> Повторить задания
            </button>
          </div>
          <div className="space-y-3">
            {lesson.interactive_tasks.map((t, i) => (
              <InteractiveTask key={`${replayKey}-${i}`} lessonId={id} task={t} index={i}
                prior={lesson.prior_answers?.[i]} onAskFili={(text) => openFili(text)} />
            ))}
          </div>
        </section>
      )}

      {/* Check understanding */}
      {lesson.mini_questions?.length > 0 && (
        <section className="mb-5">
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Проверь понимание</h2>
          <div className="space-y-3">
            {lesson.mini_questions.map((q, i) => <MiniQuestion key={i} q={q} index={i} />)}
          </div>
        </section>
      )}

      {/* Фили — открывается полноценный ИИ-чат с контекстом урока */}
      <section className="ls-card p-5 mb-5 flex items-center gap-4" data-testid="lesson-fili-cta">
        <Wizard size={44} />
        <div className="flex-1">
          <div className="font-display font-semibold text-[#1E2A4A]">Нужна помощь с темой?</div>
          <div className="text-sm text-[#8A94A6]">Открой полноценный чат с Фили — контекст этого урока подставится автоматически.</div>
        </div>
        <button onClick={() => openFili()} data-testid="lesson-open-fili-btn" className="btn-accent inline-flex items-center gap-2 shrink-0">
          <Sparkles className="w-4 h-4" /> Фили объяснит
        </button>
      </section>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!completed && lesson.status !== "completed" ? (
          <button onClick={complete} data-testid="complete-lesson-btn" className="btn-primary inline-flex items-center gap-2 flex-1 justify-center">
            <CheckCircle2 className="w-5 h-5" /> Завершить урок
          </button>
        ) : (
          <button onClick={replayTasks} data-testid="repeat-lesson-btn" className="btn-primary inline-flex items-center gap-2 flex-1 justify-center">
            <RotateCcw className="w-5 h-5" /> Повторить урок
          </button>
        )}
        <button onClick={() => navigate(`/app/practice?subject=${lesson.subject_id}&topic=${lesson.topic_id}`)}
          data-testid="lesson-practice-btn" className="btn-accent inline-flex items-center gap-2 justify-center">
          <Dumbbell className="w-5 h-5" /> К практике
        </button>
      </div>
    </div>
  );
}
