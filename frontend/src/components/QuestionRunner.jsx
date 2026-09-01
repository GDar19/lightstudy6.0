import React, { useState } from "react";
import { Check, X, ArrowRight, Sparkles, Lightbulb } from "lucide-react";
import { DifficultyBadge } from "./common";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
const CHOICE = ["single_choice", "true_false"];

export default function QuestionRunner({ questions, onAnswer, onFinish, title, subtitle, showAskAI }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);      // index for single/true_false
  const [multi, setMulti] = useState([]);              // array for multiple_choice
  const [textVal, setTextVal] = useState("");          // numeric/text
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const type = q.type || "single_choice";

  const submit = async (answer) => {
    if (feedback || submitting) return;
    setSubmitting(true);
    try {
      const res = await onAnswer(q, answer);
      setFeedback(res);
      if (res.is_correct) setCorrectCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const chooseSingle = (i) => { setSelected(i); submit(i); };
  const toggleMulti = (i) => setMulti((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i]));

  const next = () => {
    if (isLast) { onFinish({ correct: correctCount, total: questions.length }); return; }
    setIdx((i) => i + 1);
    setSelected(null); setMulti([]); setTextVal(""); setFeedback(null); setShowHint(false);
  };

  const correctText = feedback && (
    feedback.type === "numeric" || feedback.type === "text"
      ? (Array.isArray(feedback.correct_value) ? feedback.correct_value.join(" / ") : feedback.correct_value)
      : null
  );

  const optionClass = (i) => {
    if (feedback) {
      const correctSet = Array.isArray(feedback.correct_answer) ? feedback.correct_answer : [feedback.correct_answer];
      if (correctSet.includes(i)) return "border-[#10B981] bg-[#ECFDF5]";
      const picked = type === "multiple_choice" ? multi.includes(i) : selected === i;
      if (picked) return "border-[#EF4444] bg-[#FEE2E2]";
      return "border-[#E5DEC9] bg-[#FAF8F3] opacity-60";
    }
    const picked = type === "multiple_choice" ? multi.includes(i) : selected === i;
    return picked ? "border-[#7C66DC] bg-[#EEEAFB]" : "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#C5BCFA]";
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#1E2A4A]">{title}</h2>
          {subtitle && <p className="text-sm text-[#8A94A6]">{subtitle}</p>}
        </div>
        <span className="text-sm font-medium text-[#8A94A6]" data-testid="question-counter">Вопрос {idx + 1} из {questions.length}</span>
      </div>

      <div className="h-1.5 rounded-full bg-[#E5DEC9] mb-6 overflow-hidden">
        <div className="h-full bg-[#7C66DC] transition-all duration-500" style={{ width: `${((idx + (feedback ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      <div className="ls-card p-6 sm:p-7" data-testid="question-card">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <DifficultyBadge level={q.difficulty} />
          {q.exam_part && <span className="text-xs font-medium text-[#7C66DC] bg-[#EEEAFB] px-2 py-0.5 rounded-full">{q.exam_part}</span>}
          {q.ege_category && <span className="text-xs text-[#8A94A6]">{q.ege_category}</span>}
          {type === "multiple_choice" && <span className="text-xs text-[#8A94A6]">(выберите все верные)</span>}
        </div>
        <div className="font-display text-lg font-semibold text-[#1E2A4A] leading-relaxed whitespace-pre-line">{q.question}</div>

        {/* Choice-based */}
        {(CHOICE.includes(type) || type === "multiple_choice") && (
          <div className="mt-6 space-y-3">
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => (type === "multiple_choice" ? !feedback && toggleMulti(i) : chooseSingle(i))}
                disabled={!!feedback || submitting} data-testid={`option-${i}`}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${optionClass(i)}`}>
                <span className="w-8 h-8 shrink-0 rounded-lg bg-white border border-[#E5DEC9] flex items-center justify-center font-semibold text-sm text-[#1E2A4A]">{LETTERS[i]}</span>
                <span className="text-[#1E2A4A]">{opt}</span>
              </button>
            ))}
            {type === "multiple_choice" && !feedback && (
              <button onClick={() => submit(multi)} disabled={submitting || multi.length === 0} data-testid="check-answer-btn"
                className="btn-accent w-full disabled:opacity-50">Проверить</button>
            )}
          </div>
        )}

        {/* Text / numeric input */}
        {(type === "numeric" || type === "text") && !feedback && (
          <div className="mt-6 flex gap-2">
            <input value={textVal} onChange={(e) => setTextVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && textVal.trim() && submit(textVal.trim())}
              inputMode={type === "numeric" ? "decimal" : "text"} data-testid="answer-input"
              placeholder={type === "numeric" ? "Введите число" : "Введите ответ"}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]" />
            <button onClick={() => textVal.trim() && submit(textVal.trim())} disabled={submitting || !textVal.trim()}
              data-testid="check-answer-btn" className="btn-accent disabled:opacity-50">Проверить</button>
          </div>
        )}
        {(type === "numeric" || type === "text") && feedback && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
            Твой ответ: <span className="font-semibold">{String(textVal)}</span>
          </div>
        )}

        {/* Hint (before answering) */}
        {!feedback && q.hint && (
          <div className="mt-4">
            <button onClick={() => setShowHint((s) => !s)} data-testid="hint-btn"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F59E0B] hover:underline">
              <Lightbulb className="w-4 h-4" /> {showHint ? "Скрыть подсказку" : "Подсказка"}
            </button>
            {showHint && <p className="text-sm text-[#4B5563] mt-2 p-3 rounded-xl bg-[#FEF3C7]">{q.hint}</p>}
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className="mt-5 animate-fade-up">
            <div className={`p-4 rounded-xl ${feedback.is_correct ? "bg-[#ECFDF5]" : "bg-[#FEF3C7]"}`}>
              <div className="font-semibold text-[#1E2A4A] flex items-center gap-2">
                {feedback.is_correct ? <><Check className="w-4 h-4 text-[#10B981]" /> Верно!</> : <><X className="w-4 h-4 text-[#F59E0B]" /> Не совсем</>}
              </div>
              {!feedback.is_correct && correctText && <div className="text-sm text-[#10B981] mt-1.5">Правильный ответ: {correctText}</div>}
              {feedback.explanation && <p className="text-sm text-[#4B5563] mt-1.5">{feedback.explanation}</p>}
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
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
