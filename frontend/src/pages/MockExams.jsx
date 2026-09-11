import React, { useEffect, useState, useRef } from "react";
import { ClipboardCheck, Clock, Trophy, ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader, EmptyState, DonutRing, masteryColor, DifficultyBadge, TaskImages } from "@/components/common";

const LETTERS = ["А", "Б", "В", "Г", "Д"];

function Timer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);
  const ref = useRef();
  useEffect(() => {
    ref.current = setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(ref.current); onExpire(); return 0; } return l - 1; }), 1000);
    return () => clearInterval(ref.current);
  }, []);
  const m = String(Math.floor(left / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#182238] text-white font-mono" data-testid="mock-timer">
      <Clock className="w-4 h-4" /> {m}:{s}
    </div>
  );
}

function Running({ exam, onDone }) {
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const startRef = useRef(Date.now());
  const q = exam.questions[idx];

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const timeSpent = Math.round((Date.now() - startRef.current) / 1000);
    try {
      const { data } = await api.finishMock(exam.attempt_id, { answers, time_spent: timeSpent });
      onDone(data);
    } catch { toast.error("Ошибка отправки"); setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-[#1E2A4A]">{exam.subject_name}</h2>
        <Timer seconds={exam.duration_min * 60} onExpire={submit} />
      </div>

      {/* Question navigator */}
      <div className="flex flex-wrap gap-2 mb-4">
        {exam.questions.map((qq, i) => (
          <button key={qq.id} onClick={() => setIdx(i)} data-testid={`mock-nav-${i}`}
            className={`w-9 h-9 rounded-lg text-sm font-semibold ${i === idx ? "bg-[#C9A227] text-[#1E2A4A]" : answers[qq.id] != null ? "bg-[#F6EFDA] text-[#B0862A]" : "bg-[#F0EBE1] text-[#8A94A6]"}`}>
            {i + 1}
          </button>
        ))}
      </div>

      <div className="ls-card p-6" data-testid="mock-question">
        <div className="flex items-center gap-2 mb-3"><DifficultyBadge level={q.difficulty} /><span className="text-xs text-[#8A94A6]">{q.ege_category}</span></div>
        <div className="font-display text-lg font-semibold text-[#1E2A4A] whitespace-pre-line">{q.question}</div>
        <TaskImages images={q.images} />
        <div className="mt-5 space-y-3">
          {(q.type === "single_choice" || q.type === "true_false" || q.type === "multiple_choice") &&
            q.options.map((o, i) => {
              const val = answers[q.id];
              const picked = q.type === "multiple_choice" ? Array.isArray(val) && val.includes(i) : val === i;
              return (
                <button key={i} onClick={() => setAnswers((a) => {
                  if (q.type === "multiple_choice") {
                    const cur = Array.isArray(a[q.id]) ? a[q.id] : [];
                    return { ...a, [q.id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
                  }
                  return { ...a, [q.id]: i };
                })} data-testid={`mock-option-${i}`}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${picked ? "border-[#B0862A] bg-[#F6EFDA]" : "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#E7D5A2]"}`}>
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-white border border-[#E5DEC9] flex items-center justify-center font-semibold text-sm">{LETTERS[i]}</span>
                  <span className="text-[#1E2A4A]">{o}</span>
                </button>
              );
            })}
          {(q.type === "numeric" || q.type === "text") && (
            <input value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              data-testid="mock-answer-input" placeholder={q.type === "numeric" ? "Введите число" : "Введите ответ"}
              className="w-full px-4 py-3 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]" />
          )}
        </div>
        <div className="flex items-center justify-between mt-6">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
            className="px-4 py-2.5 rounded-xl font-medium text-[#4B5563] hover:bg-[#F0EBE1] disabled:opacity-40">Назад</button>
          {idx < exam.questions.length - 1 ? (
            <button onClick={() => setIdx((i) => i + 1)} className="btn-primary inline-flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></button>
          ) : (
            <button onClick={submit} disabled={submitting} data-testid="mock-submit-btn" className="btn-accent">{submitting ? "Отправляем…" : "Завершить пробник"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Result({ result, onBack }) {
  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      <div className="ls-card p-8 text-center">
        <Trophy className="w-12 h-12 text-[#F59E0B] mx-auto mb-3" />
        <h2 className="font-display text-2xl font-extrabold text-[#1E2A4A]">Пробник завершён!</h2>
        <div className="my-6 flex justify-center gap-8">
          <DonutRing value={result.score} size={130} label={result.score} sub="балл" color={masteryColor(result.accuracy)} />
        </div>
        <p className="text-[#4B5563]">Правильно {result.correct} из {result.total} · Точность {result.accuracy}%</p>
        {result.time_spent != null && <p className="text-sm text-[#8A94A6] mt-1">Время: {Math.floor(result.time_spent / 60)} мин {result.time_spent % 60} сек</p>}
      </div>

      {result.topic_breakdown?.length > 0 && (
        <div className="ls-card p-6 mt-5">
          <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">По темам</h3>
          <div className="space-y-3">
            {result.topic_breakdown.map((t, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1"><span className="text-[#1E2A4A] font-medium">{t.topic}</span><span className="text-[#8A94A6]">{t.mastery}%</span></div>
                <div className="h-2 rounded-full bg-[#EDE6D6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.mastery}%`, background: masteryColor(t.mastery) }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.review?.length > 0 && (
        <div className="ls-card p-6 mt-5">
          <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Разбор ошибок</h3>
          <div className="space-y-4">
            {result.review.map((r, i) => (
              <div key={i} className="p-4 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
                <div className="font-medium text-[#1E2A4A]">{r.question}</div>
                <TaskImages images={r.images} />
                <div className="text-sm text-[#EF4444] mt-2 flex items-center gap-1.5"><X className="w-4 h-4" /> Твой ответ: {(r.type === "numeric" || r.type === "text") ? (r.student_answer ?? "—") : (r.options[r.student_answer] ?? "—")}</div>
                <div className="text-sm text-[#10B981] flex items-center gap-1.5"><Check className="w-4 h-4" /> Правильно: {(r.type === "numeric" || r.type === "text") ? (Array.isArray(r.correct_value) ? r.correct_value.join(" / ") : r.correct_value) : r.options[r.correct_answer]}</div>
                {r.explanation && <p className="text-sm text-[#4B5563] mt-2">{r.explanation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.recommendations?.length > 0 && (
        <div className="ls-card p-5 mt-5 bg-[#F6EFDA]/40">
          <div className="font-semibold text-[#1E2A4A]">Рекомендуем повторить</div>
          <p className="text-sm text-[#4B5563] mt-1">{result.recommendations.join(", ")}</p>
        </div>
      )}

      <button onClick={onBack} className="btn-primary w-full mt-6">К списку пробников</button>
    </div>
  );
}

export default function MockExams() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = () => { setLoading(true); api.mockExams().then(({ data }) => setData(data)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const start = async (subjectId) => {
    setStarting(true);
    try { const { data } = await api.startMock(subjectId); setRunning(data); setResult(null); }
    catch (e) { toast.error(e.response?.data?.detail || "Ошибка"); }
    finally { setStarting(false); }
  };

  if (loading || starting) return <Loader full label={starting ? "Готовим пробник…" : "Загрузка…"} />;
  if (result) return <div className="py-2"><Result result={result} onBack={() => { setResult(null); load(); }} /></div>;
  if (running) return <div className="py-2"><Running exam={running} onDone={(r) => { setResult(r); setRunning(null); }} /></div>;

  if (!data?.exams?.length) {
    return (<div className="animate-fade-up"><h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Пробники ЕГЭ</h1>
      <EmptyState icon={ClipboardCheck} title="Нет доступных пробников" description="Выбери предметы в профиле, чтобы проходить пробные экзамены." /></div>);
  }

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Пробники ЕГЭ</h1>
      <p className="text-[#4B5563] mt-1 mb-6">Тренировочные пробные экзамены с таймером и разбором. Задания носят учебный характер.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.exams.map((s) => (
          <div key={s.id} className="ls-card p-6" data-testid={`mock-card-${s.id}`}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${s.color}18` }}>
              <ClipboardCheck className="w-5 h-5" style={{ color: s.color }} />
            </div>
            <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">{s.name}</h3>
            <div className="text-sm text-[#8A94A6] mt-1">{s.question_count} заданий · {s.duration} мин</div>
            {s.best_score != null && <div className="text-sm text-[#10B981] font-medium mt-2">Лучший балл: {s.best_score}</div>}
            <button onClick={() => start(s.id)} data-testid={`start-mock-${s.id}`} className="btn-primary w-full mt-4">Начать пробник</button>
          </div>
        ))}
      </div>

      {data.history?.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">История</h2>
          <div className="space-y-3">
            {data.history.map((h) => (
              <div key={h.id} className="ls-card p-4 flex items-center justify-between">
                <div><div className="font-medium text-[#1E2A4A]">{h.subject_name}</div>
                  <div className="text-xs text-[#8A94A6]">{new Date(h.finished_at).toLocaleDateString("ru-RU")}</div></div>
                <div className="text-right"><div className="font-display font-bold text-[#B0862A]">{h.score} балл</div>
                  <div className="text-xs text-[#8A94A6]">точность {h.accuracy}%</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
