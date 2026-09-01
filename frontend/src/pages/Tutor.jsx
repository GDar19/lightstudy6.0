import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Plus, Trash2, Sparkles, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Wizard } from "@/components/common";
import AIAnswer from "@/components/AIAnswer";

const QUICK = [
  { label: "Объясни проще", text: "Объясни это проще" },
  { label: "С примером", text: "Объясни на конкретном примере" },
  { label: "Дай аналогию", text: "Приведи наглядную аналогию" },
  { label: "Дай задачу", text: "Дай мне тренировочную задачу по теме" },
  { label: "Проверь решение", text: "Проверь моё решение" },
  { label: "Подготовь к ЕГЭ", text: "Как эта тема встречается на ЕГЭ?" },
  { label: "Краткий конспект", text: "Сделай краткий конспект по теме" },
];

export default function Tutor() {
  const [params] = useSearchParams();
  const [convos, setConvos] = useState([]);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [available, setAvailable] = useState(true);
  const scrollRef = useRef(null);
  const autoSentRef = useRef(false);
  const topicId = params.get("topic");
  const lessonId = params.get("lesson");

  const loadConvos = () => api.aiConversations().then(({ data }) => setConvos(data)).catch(() => {});

  useEffect(() => {
    api.aiStatus().then(({ data }) => setAvailable(data.available)).catch(() => {});
    loadConvos();
    const q = params.get("q");
    if (q && !autoSentRef.current) {
      autoSentRef.current = true;
      setTimeout(() => send(q), 300);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const openConvo = async (id) => {
    setConvId(id);
    const { data } = await api.aiConversation(id);
    setMessages(data.messages);
  };

  const newChat = () => { setConvId(null); setMessages([]); };

  const send = async (textArg) => {
    const text = (typeof textArg === "string" ? textArg : input).trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text, id: `tmp-${Date.now()}` }]);
    setSending(true);
    try {
      const { data } = await api.aiChat({ message: text, conversation_id: convId, topic_id: topicId || null, lesson_id: lessonId || null });
      setConvId(data.conversation_id);
      setAvailable(data.available);
      setMessages((m) => [...m, { role: "assistant", content: data.answer, id: `a-${Date.now()}` }]);
      loadConvos();
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "ИИ-помощник временно недоступен. Попробуй ещё раз.", id: `e-${Date.now()}` }]);
    } finally {
      setSending(false);
    }
  };

  const clearConvo = async () => {
    if (!convId) { newChat(); return; }
    await api.aiClear(convId);
    newChat();
    loadConvos();
    toast.success("Диалог очищен");
  };

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-2">ИИ-помощник</h1>
      {!available && (
        <div className="text-sm text-[#F59E0B] bg-[#FEF3C7] px-4 py-2.5 rounded-xl mb-4" data-testid="ai-unavailable-banner">
          ИИ-помощник временно недоступен. Ответы могут не приходить.
        </div>
      )}

      <div className="grid lg:grid-cols-[260px,1fr] gap-6">
        {/* Conversations */}
        <div className="hidden lg:block">
          <button onClick={newChat} data-testid="new-chat-btn" className="btn-accent w-full inline-flex items-center justify-center gap-2 mb-4">
            <Plus className="w-4 h-4" /> Новый диалог
          </button>
          <div className="space-y-2">
            {convos.length === 0 && <p className="text-sm text-[#8A94A6] px-2">История пуста</p>}
            {convos.map((c) => (
              <button key={c.id} onClick={() => openConvo(c.id)} data-testid={`convo-${c.id}`}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm truncate flex items-center gap-2 ${convId === c.id ? "bg-[#EEEAFB] text-[#7C66DC]" : "text-[#4B5563] hover:bg-[#F0EBE1]"}`}>
                <MessageSquare className="w-4 h-4 shrink-0" /> {c.title}
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="ls-card flex flex-col h-[70vh] min-h-[500px] min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5DEC9]">
            <div className="flex items-center gap-3">
              <Wizard size={36} />
              <div>
                <div className="font-display font-semibold text-[#1E2A4A]">Фили</div>
                <div className="text-xs text-[#8A94A6]">Твой ИИ-репетитор</div>
              </div>
            </div>
            <button onClick={clearConvo} data-testid="clear-chat-btn" className="p-2 rounded-lg text-[#8A94A6] hover:bg-[#F0EBE1] hover:text-[#EF4444]">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4" data-testid="chat-messages">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <Wizard size={80} float />
                <div className="font-display font-semibold text-lg text-[#1E2A4A] mt-4">Привет! Я Фили 👋</div>
                <p className="text-sm text-[#4B5563] mt-2 max-w-sm">Задай любой вопрос по школьному предмету или теме занятий — объясню, приведу пример и помогу подготовиться к ЕГЭ.</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                {m.role === "assistant" && <Wizard size={32} className="shrink-0 mt-1" />}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${m.role === "user" ? "bg-[#7C66DC] text-white rounded-tr-sm" : "bg-[#FAF8F3] border border-[#E5DEC9] rounded-tl-sm"}`}>
                  {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <AIAnswer text={m.content} />}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2.5">
                <Wizard size={32} className="shrink-0 mt-1" />
                <div className="px-4 py-3 rounded-2xl bg-[#FAF8F3] border border-[#E5DEC9] rounded-tl-sm">
                  <AIAnswer loading />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-4 py-2 border-t border-[#E5DEC9] flex gap-2 overflow-x-auto">
            {QUICK.map((q) => (
              <button key={q.label} onClick={() => send(q.text)} disabled={sending}
                data-testid={`quick-${q.label}`}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-[#EEEAFB] text-[#7C66DC] hover:bg-[#E3DCF7] disabled:opacity-50">
                {q.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#E5DEC9] flex items-end gap-2">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Введите ваш вопрос…" rows={1} data-testid="chat-input"
              className="flex-1 resize-none px-4 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC] max-h-32"
            />
            <button onClick={() => send()} disabled={sending || !input.trim()} data-testid="chat-send-btn"
              className="btn-accent p-3 rounded-xl disabled:opacity-50">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
