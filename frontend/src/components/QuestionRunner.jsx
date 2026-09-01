import React, { useState } from "react";
import { Check, X, ArrowRight, Sparkles } from "lucide-react";
import { DifficultyBadge } from "./common";

const LETTERS = ["А", "Б", "В", "Г", "Д"];

/**
 * Generic question runner with per-question feedback.
 * props:
 *  - questions: [{id, question, options, difficulty, ege_category}]
 *  - onAnswer(question, index) -> Promise<{is_correct, correct_answer, explanation, mastery?}>
 *  - onFinish() -> void
 *  - title, subtitle
 *  - showAskAI: (question) => void   (optional)
 */
export default function QuestionRunner({ questions, onAnswer, onFinish, title, subtitle, showAskAI }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  const choose = async (i) => {
    if (feedback || submitting) return;
    setSelected(i);
    setSubmitting(true);
    try {
      const res = await onAnswer(q, i);
      setFeedback(res);
      if (res.is_correct) setCorrectCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (isLast) { onFinish({ correct: correctCount, total: questions.length }); return; }
    setIdx((i) => i + 1);
    setSelected(null);
    setFeedback(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#1E2A4A]">{title}</h2>
          {subtitle && <p className="text-sm text-[#8A94A6]">{subtitle}</p>}
        </div>
        <span className="text-sm font-medium text-[#8A94A6]" data-testid="question-counter">
          Вопрос {idx + 1} из {questions.length}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-[#E5DEC9] mb-6 overflow-hidden">
        <div className="h-full bg-[#7C66DC] transition-all duration-500" style={{ width: `${((idx + (feedback ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      <div className="ls-card p-6 sm:p-7" data-testid="question-card">
        <div className="flex items-center gap-2 mb-4">
          <DifficultyBadge level={q.difficulty} />
          {q.ege_category && <span className="text-xs text-[#8A94A6]">{q.ege_category}</span>}
        </div>
        <div className="font-display text-lg font-semibold text-[#1E2A4A] leading-relaxed whitespace-pre-line">{q.question}</div>

        <div className="mt-6 space-y-3">
          {q.options.map((opt, i) => {
            let cls = "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#C5BCFA]";
            if (feedback) {
              if (i === feedback.correct_answer) cls = "border-[#10B981] bg-[#ECFDF5]";
              else if (i === selected) cls = "border-[#EF4444] bg-[#FEE2E2]";
              else cls = "border-[#E5DEC9] bg-[#FAF8F3] opacity-60";
            } else if (i === selected) cls = "border-[#7C66DC] bg-[#EEEAFB]";
            return (
              <button key={i} onClick={() => choose(i)} disabled={!!feedback || submitting}
                data-testid={`option-${i}`}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${cls}`}>
                <span className="w-8 h-8 shrink-0 rounded-lg bg-white border border-[#E5DEC9] flex items-center justify-center font-semibold text-sm text-[#1E2A4A]">
                  {LETTERS[i]}
                </span>
                <span className="text-[#1E2A4A]">{opt}</span>
                {feedback && i === feedback.correct_answer && <Check className="w-5 h-5 text-[#10B981] ml-auto" />}
                {feedback && i === selected && i !== feedback.correct_answer && <X className="w-5 h-5 text-[#EF4444] ml-auto" />}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="mt-5 animate-fade-up">
            <div className={`p-4 rounded-xl ${feedback.is_correct ? "bg-[#ECFDF5]" : "bg-[#FEF3C7]"}`}>
              <div className="font-semibold text-[#1E2A4A] flex items-center gap-2">
                {feedback.is_correct ? <><Check className="w-4 h-4 text-[#10B981]" /> Верно!</> : <><X className="w-4 h-4 text-[#F59E0B]" /> Не совсем</>}
              </div>
              {feedback.explanation && <p className="text-sm text-[#4B5563] mt-1.5">{feedback.explanation}</p>}
            </div>
            <div className="flex items-center gap-3 mt-4">
              {showAskAI && (
                <button onClick={() => showAskAI(q)} data-testid="ask-ai-btn" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#7C66DC] bg-[#EEEAFB] hover:bg-[#E3DCF7]">
                  <Sparkles className="w-4 h-4" /> Спросить Фили
                </button>
              )}
              <button onClick={next} data-testid="next-question-btn" className="btn-primary inline-flex items-center gap-2 ml-auto">
                {isLast ? "Завершить" : "Следующий вопрос"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
