import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronRight, Check, X, CheckCircle2, Dumbbell, Sparkles, Lightbulb, Send, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader, Wizard, TaskImages } from "@/components/common";
import AIAnswer from "@/components/AIAnswer";

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
            let cls = "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#C5BCFA]";
            if (feedback) {
              if (i === task.answer) cls = "border-[#10B981] bg-[#ECFDF5]";
              else if (i === sel) cls = "border-[#EF4444] bg-[#FEE2E2]";
            } else if (i === sel) cls = "border-[#7C66DC] bg-[#EEEAFB]";
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
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]" />
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
          <button onClick={askFili} data-testid={`task-${index}-ask-fili`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#7C66DC] hover:underline">
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
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const chatRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    api.lesson(id).then(({ data }) => setLesson(data)).catch(() => {}).finally(() => setLoading(false));
    api.lessonChat(id).then(({ data }) => setMessages(data.messages || [])).catch(() => {});
  }, [id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatSending]);

  const sendToFili = async (text, taskIndex = null) => {
    const msg = (typeof text === "string" ? text : chatInput).trim();
    if (!msg || chatSending) return;
    if (typeof text !== "string") setChatInput("");
    chatRef.current?.scrollIntoView({ behavior: "smooth" });
    setMessages((m) => [...m, { role: "user", content: msg, id: `u${Date.now()}` }]);
    setChatSending(true);
    try {
      const { data } = await api.lessonChatSend(id, { message: msg, task_index: taskIndex });
      setMessages((m) => [...m, { role: "assistant", content: data.answer, id: `a${Date.now()}` }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "ИИ-помощник временно недоступен. Попробуй ещё раз.", id: `e${Date.now()}` }]);
    } finally {
      setChatSending(false);
    }
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
        <button onClick={() => sendToFili("Объясни тему урока «" + lesson.title + "» простыми словами.")}
          data-testid="lesson-ask-fili-btn" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7C66DC] hover:underline ml-auto">
          <Sparkles className="w-4 h-4" /> Фили, объясни
        </button>
      </div>

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

      {/* Interactive tasks (graded + saved) */}
      {lesson.interactive_tasks?.length > 0 && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">Интерактивные задания</h2>
            <button onClick={replayTasks} data-testid="replay-tasks-btn" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7C66DC] hover:underline">
              <RotateCcw className="w-3.5 h-3.5" /> Повторить задания
            </button>
          </div>
          <div className="space-y-3">
            {lesson.interactive_tasks.map((t, i) => (
              <InteractiveTask key={`${replayKey}-${i}`} lessonId={id} task={t} index={i}
                prior={lesson.prior_answers?.[i]} onAskFili={sendToFili} />
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

      {/* Фили — контекстный чат урока */}
      <section ref={chatRef} className="ls-card p-0 mb-5 overflow-hidden" data-testid="lesson-chat">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#E5DEC9] bg-[#FAF8F3]">
          <Wizard size={36} />
          <div>
            <div className="font-display font-semibold text-[#1E2A4A]">Фили — репетитор урока</div>
            <div className="text-xs text-[#8A94A6]">Задай вопрос или ответь на вопрос Фили прямо здесь</div>
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto px-4 py-4 space-y-3" data-testid="lesson-chat-messages">
          {messages.length === 0 && !chatSending && (
            <div className="text-center py-6">
              <Wizard size={64} float />
              <p className="text-sm text-[#4B5563] mt-3 max-w-sm mx-auto">Привет! Спроси меня о теме урока, попроси объяснить пример или проверить твоё решение.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && <Wizard size={30} className="shrink-0 mt-1" />}
              <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl ${m.role === "user" ? "bg-[#7C66DC] text-white rounded-tr-sm" : "bg-[#FAF8F3] border border-[#E5DEC9] rounded-tl-sm"}`}>
                {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <AIAnswer text={m.content} />}
              </div>
            </div>
          ))}
          {chatSending && (
            <div className="flex gap-2.5">
              <Wizard size={30} className="shrink-0 mt-1" />
              <div className="px-4 py-3 rounded-2xl bg-[#FAF8F3] border border-[#E5DEC9] rounded-tl-sm"><AIAnswer loading /></div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        <div className="px-4 py-2 border-t border-[#E5DEC9] flex gap-2 overflow-x-auto">
          {[["Проще", "Объясни это, пожалуйста, проще."], ["С примером", "Покажи это на конкретном примере с решением."], ["Не понял", "Я не понял. Объясни, пожалуйста, ещё раз по шагам."]].map(([label, text]) => (
            <button key={label} onClick={() => sendToFili(text)} disabled={chatSending} data-testid={`lesson-quick-${label}`}
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-[#EEEAFB] text-[#7C66DC] hover:bg-[#E3DCF7] disabled:opacity-50">{label}</button>
          ))}
        </div>

        <div className="p-3 border-t border-[#E5DEC9] flex items-end gap-2">
          <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToFili(); } }}
            placeholder="Спросите Фили о чём угодно или введите ответ…" rows={1} data-testid="lesson-chat-input"
            className="flex-1 resize-none px-4 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC] max-h-32" />
          <button onClick={() => sendToFili()} disabled={chatSending || !chatInput.trim()} data-testid="lesson-chat-send"
            className="btn-accent p-3 rounded-xl disabled:opacity-50"><Send className="w-5 h-5" /></button>
        </div>
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
