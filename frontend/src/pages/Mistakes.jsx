import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, RotateCcw, Check, X, Smile } from "lucide-react";
import { api } from "@/api/client";
import { Loader, EmptyState, DifficultyBadge } from "@/components/common";

export default function Mistakes() {
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.mistakes().then(({ data }) => setMistakes(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader full />;

  const unresolved = mistakes.filter((m) => !m.resolved);

  // group by subject
  const bySubject = {};
  mistakes.forEach((m) => { (bySubject[m.subject_name] = bySubject[m.subject_name] || []).push(m); });

  const retry = () => {
    // start a mistakes practice for the subject with most unresolved, or first
    const first = unresolved[0];
    if (first) navigate(`/app/practice?subject=${first.subject_id}&mode=mistakes`);
  };

  if (mistakes.length === 0) {
    return (
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Работа над ошибками</h1>
        <EmptyState icon={Smile} title="Пока ошибок нет — отлично!" description="Решай задания в практике — сюда попадут вопросы, в которых ты ошибёшься." testId="mistakes-empty" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Работа над ошибками</h1>
          <p className="text-[#4B5563] mt-1">Неисправленных ошибок: {unresolved.length}</p>
        </div>
        {unresolved.length > 0 && (
          <button onClick={retry} data-testid="retry-mistakes-btn" className="btn-accent inline-flex items-center gap-2 self-start">
            <RotateCcw className="w-4 h-4" /> Повторить ошибки
          </button>
        )}
      </div>

      <div className="space-y-6">
        {Object.entries(bySubject).map(([subj, items]) => (
          <div key={subj}>
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">{subj}</h2>
            <div className="space-y-3">
              {items.map((m) => (
                <div key={m.id} className="ls-card p-5" data-testid={`mistake-card-${m.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#8A94A6]">{m.topic_name}</span>
                      <DifficultyBadge level={m.difficulty} />
                    </div>
                    {m.resolved
                      ? <span className="text-xs font-semibold text-[#10B981] bg-[#ECFDF5] px-2.5 py-1 rounded-full">Исправлено</span>
                      : <span className="text-xs font-semibold text-[#EF4444] bg-[#FEE2E2] px-2.5 py-1 rounded-full">Ошибка</span>}
                  </div>
                  <div className="font-medium text-[#1E2A4A]">{m.question}</div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-[#EF4444]">
                      <X className="w-4 h-4" /> Твой ответ: {m.options[m.student_answer] ?? "—"}
                    </div>
                    <div className="flex items-center gap-2 text-[#10B981]">
                      <Check className="w-4 h-4" /> Правильно: {m.options[m.correct_answer]}
                    </div>
                  </div>
                  {m.explanation && <p className="text-sm text-[#4B5563] mt-3 p-3 rounded-xl bg-[#FAF8F3]">{m.explanation}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
