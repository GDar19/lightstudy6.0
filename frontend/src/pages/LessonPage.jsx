import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronRight, Check, X, CheckCircle2, Dumbbell, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader } from "@/components/common";

function MiniQuestion({ q, index }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="ls-card p-5" data-testid={`mini-question-${index}`}>
      <div className="font-medium text-[#1E2A4A] mb-3">{q.question}</div>
      <div className="space-y-2">
        {q.options.map((o, i) => {
          let cls = "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#C5BCFA]";
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

  useEffect(() => {
    api.lesson(id).then(({ data }) => setLesson(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

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
      <div className="text-sm text-[#8A94A6] mt-1 mb-6">{lesson.duration} мин</div>

      {/* Explanation */}
      <section className="ls-card p-6 mb-5">
        <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Объяснение</h2>
        <p className="text-[#4B5563] leading-relaxed">{lesson.explanation}</p>
        {lesson.key_points?.length > 0 && (
          <ul className="mt-4 space-y-2">
            {lesson.key_points.map((k, i) => (
              <li key={i} className="flex gap-2 text-[#1E2A4A]"><Check className="w-4 h-4 text-[#7C66DC] mt-1 shrink-0" /> {k}</li>
            ))}
          </ul>
        )}
        {lesson.formulas?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lesson.formulas.map((f, i) => (
              <span key={i} className="font-mono text-sm px-3 py-1.5 rounded-lg bg-[#182238] text-[#C5BCFA]">{f}</span>
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
                <div className="font-mono text-sm text-[#7C66DC] mt-1.5">→ {e.solution}</div>
              </div>
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

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!completed ? (
          <button onClick={complete} data-testid="complete-lesson-btn" className="btn-primary inline-flex items-center gap-2 flex-1 justify-center">
            <CheckCircle2 className="w-5 h-5" /> Завершить урок
          </button>
        ) : (
          <div className="flex-1 inline-flex items-center justify-center gap-2 text-[#10B981] font-semibold py-3 bg-[#ECFDF5] rounded-xl">
            <CheckCircle2 className="w-5 h-5" /> Урок завершён
          </div>
        )}
        <button onClick={() => navigate(`/app/practice?subject=${lesson.subject_id}&topic=${lesson.topic_id}`)}
          data-testid="lesson-practice-btn" className="btn-accent inline-flex items-center gap-2 justify-center">
          <Dumbbell className="w-5 h-5" /> К практике
        </button>
      </div>
    </div>
  );
}
