import React, { useState } from "react";
import { Check, X, ArrowRight, Sparkles, Lightbulb, ArrowUp, ArrowDown } from "lucide-react";
import { DifficultyBadge } from "./common";
import { mediaUrl } from "@/api/client";

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
const CHOICE = ["single_choice", "true_false"];
const ANALYSIS = ["graph_analysis", "diagram_analysis", "image_analysis"];

function TaskImages({ images }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="task-images">
      {images.map((img, i) => (
        <figure key={i} className="rounded-xl overflow-hidden border border-[#E5DEC9] bg-white">
          <img src={mediaUrl(img.url || img.media_id)} alt={img.caption || `Изображение ${i + 1}`}
            data-testid={`task-image-${i}`} className="w-full object-contain max-h-72 bg-[#FAF8F3]" />
          {img.caption && <figcaption className="text-xs text-[#8A94A6] px-3 py-2">{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export default function QuestionRunner({ questions, onAnswer, onFinish, title, subtitle, showAskAI }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);      // index for single/true_false
  const [multi, setMulti] = useState([]);              // array for multiple_choice
  const [textVal, setTextVal] = useState("");          // numeric/text
  const [matchSel, setMatchSel] = useState({});        // {leftIndex: rightIndex}
  const [order, setOrder] = useState(null);            // [{item, orig}] current ordering
  const [tableVals, setTableVals] = useState({});      // {blankIndex: value}
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const type = q.type || "single_choice";
  const effType = ANALYSIS.includes(type) ? (q.answer_format || "single_choice") : type;

  // init ordering shuffle lazily
  if (type === "ordering" && order === null) {
    const items = (q.order_items || []).map((item, orig) => ({ item, orig }));
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    setOrder(items);
  }

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
  const moveOrder = (i, dir) => setOrder((o) => {
    const arr = [...o]; const ni = i + dir;
    if (ni < 0 || ni >= arr.length) return o;
    [arr[i], arr[ni]] = [arr[ni], arr[i]];
    return arr;
  });

  const blankCount = (q.table_rows || []).flat().filter((c) => c === "___").length;

  const next = () => {
    if (isLast) { onFinish({ correct: correctCount, total: questions.length }); return; }
    setIdx((i) => i + 1);
    setSelected(null); setMulti([]); setTextVal(""); setMatchSel({}); setOrder(null);
    setTableVals({}); setFeedback(null); setShowHint(false);
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
      const picked = effType === "multiple_choice" ? multi.includes(i) : selected === i;
      if (picked) return "border-[#EF4444] bg-[#FEE2E2]";
      return "border-[#E5DEC9] bg-[#FAF8F3] opacity-60";
    }
    const picked = effType === "multiple_choice" ? multi.includes(i) : selected === i;
    return picked ? "border-[#B0862A] bg-[#F6EFDA]" : "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#E7D5A2]";
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
        <div className="h-full bg-[#B0862A] transition-all duration-500" style={{ width: `${((idx + (feedback ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      <div className="ls-card p-6 sm:p-7" data-testid="question-card">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <DifficultyBadge level={q.difficulty} />
          {q.ege_task_number && <span className="text-xs font-medium text-[#1E2A4A] bg-[#F0EBE1] px-2 py-0.5 rounded-full">№{q.ege_task_number}</span>}
          {q.exam_part && <span className="text-xs font-medium text-[#B0862A] bg-[#F6EFDA] px-2 py-0.5 rounded-full">{q.exam_part}</span>}
          {q.ege_category && <span className="text-xs text-[#8A94A6]">{q.ege_category}</span>}
          {effType === "multiple_choice" && <span className="text-xs text-[#8A94A6]">(выберите все верные)</span>}
        </div>
        <div className="font-display text-lg font-semibold text-[#1E2A4A] leading-relaxed whitespace-pre-line">{q.question}</div>

        {/* Task images — first-class content */}
        <TaskImages images={q.images} />

        {/* Choice-based */}
        {(CHOICE.includes(effType) || effType === "multiple_choice") && (
          <div className="mt-6 space-y-3">
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => (effType === "multiple_choice" ? !feedback && toggleMulti(i) : chooseSingle(i))}
                disabled={!!feedback || submitting} data-testid={`option-${i}`}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${optionClass(i)}`}>
                <span className="w-8 h-8 shrink-0 rounded-lg bg-white border border-[#E5DEC9] flex items-center justify-center font-semibold text-sm text-[#1E2A4A]">{LETTERS[i]}</span>
                <span className="text-[#1E2A4A]">{opt}</span>
              </button>
            ))}
            {effType === "multiple_choice" && !feedback && (
              <button onClick={() => submit(multi)} disabled={submitting || multi.length === 0} data-testid="check-answer-btn"
                className="btn-accent w-full disabled:opacity-50">Проверить</button>
            )}
          </div>
        )}

        {/* Text / numeric input */}
        {(effType === "numeric" || effType === "text") && !feedback && (
          <div className="mt-6 flex gap-2">
            <input value={textVal} onChange={(e) => setTextVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && textVal.trim() && submit(textVal.trim())}
              inputMode={effType === "numeric" ? "decimal" : "text"} data-testid="answer-input"
              placeholder={effType === "numeric" ? "Введите число" : "Введите ответ"}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]" />
            <button onClick={() => textVal.trim() && submit(textVal.trim())} disabled={submitting || !textVal.trim()}
              data-testid="check-answer-btn" className="btn-accent disabled:opacity-50">Проверить</button>
          </div>
        )}
        {(effType === "numeric" || effType === "text") && feedback && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
            Твой ответ: <span className="font-semibold">{String(textVal)}</span>
          </div>
        )}

        {/* Matching */}
        {type === "matching" && (
          <div className="mt-6 space-y-3" data-testid="matching-block">
            {(q.match_left || []).map((left, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 p-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm text-[#1E2A4A]">{LETTERS[i]}. {left}</span>
                <ArrowRight className="w-4 h-4 text-[#8A94A6] shrink-0" />
                <select value={matchSel[i] ?? ""} disabled={!!feedback} data-testid={`match-select-${i}`}
                  onChange={(e) => setMatchSel((m) => ({ ...m, [i]: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="flex-1 px-3 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]">
                  <option value="">— выбери —</option>
                  {(q.match_right || []).map((r, j) => <option key={j} value={j}>{j + 1}. {r}</option>)}
                </select>
              </div>
            ))}
            {!feedback && (
              <button data-testid="check-answer-btn" disabled={submitting || Object.keys(matchSel).length < (q.match_left || []).length || Object.values(matchSel).some((v) => v === "")}
                onClick={() => submit((q.match_left || []).map((_, i) => matchSel[i]))}
                className="btn-accent w-full disabled:opacity-50">Проверить</button>
            )}
          </div>
        )}

        {/* Ordering */}
        {type === "ordering" && order && (
          <div className="mt-6 space-y-2" data-testid="ordering-block">
            {order.map((o, i) => (
              <div key={o.orig} className="flex items-center gap-2 p-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
                <span className="w-7 h-7 rounded-lg bg-[#C9A227] text-[#1E2A4A] flex items-center justify-center text-sm font-semibold shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm text-[#1E2A4A]">{o.item}</span>
                {!feedback && (
                  <div className="flex flex-col">
                    <button onClick={() => moveOrder(i, -1)} data-testid={`order-up-${i}`} className="p-1 text-[#B0862A] hover:bg-[#F6EFDA] rounded"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => moveOrder(i, 1)} data-testid={`order-down-${i}`} className="p-1 text-[#B0862A] hover:bg-[#F6EFDA] rounded"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            ))}
            {!feedback && (
              <button data-testid="check-answer-btn" disabled={submitting}
                onClick={() => submit(order.map((o) => o.orig))}
                className="btn-accent w-full disabled:opacity-50">Проверить</button>
            )}
          </div>
        )}

        {/* Table completion */}
        {type === "table_completion" && (
          <div className="mt-6 overflow-x-auto" data-testid="table-block">
            <table className="w-full text-sm border border-[#E5DEC9] rounded-xl overflow-hidden">
              {(q.table_headers || []).length > 0 && (
                <thead className="bg-[#F0EBE1]"><tr>{q.table_headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-[#1E2A4A]">{h}</th>)}</tr></thead>
              )}
              <tbody>
                {(() => { let bi = -1; return (q.table_rows || []).map((row, r) => (
                  <tr key={r} className="border-t border-[#E5DEC9]">
                    {row.map((cell, c) => {
                      if (cell === "___") { bi += 1; const thisBi = bi; return (
                        <td key={c} className="px-2 py-1.5">
                          <input value={tableVals[thisBi] || ""} disabled={!!feedback} data-testid={`table-input-${thisBi}`}
                            onChange={(e) => setTableVals((t) => ({ ...t, [thisBi]: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-[#E5DEC9] bg-white outline-none focus:border-[#B0862A]" />
                        </td>); }
                      return <td key={c} className="px-3 py-2 text-[#1E2A4A]">{cell}</td>;
                    })}
                  </tr>
                )); })()}
              </tbody>
            </table>
            {!feedback && (
              <button data-testid="check-answer-btn" disabled={submitting}
                onClick={() => submit(Array.from({ length: blankCount }, (_, i) => (tableVals[i] || "").trim()))}
                className="btn-accent w-full mt-3 disabled:opacity-50">Проверить</button>
            )}
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
              {feedback.solution && <p className="text-sm text-[#4B5563] mt-1.5 whitespace-pre-line"><span className="font-medium">Решение:</span> {feedback.solution}</p>}
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              {showAskAI && (
                <button onClick={() => showAskAI(q)} data-testid="ask-ai-btn" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-[#B0862A] bg-[#F6EFDA] hover:bg-[#E3DCF7]">
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
