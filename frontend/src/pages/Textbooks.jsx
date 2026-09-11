import React, { useEffect, useState } from "react";
import { Library, BookOpen, Sparkles } from "lucide-react";
import { api } from "@/api/client";
import { Loader, Wizard, EmptyState } from "@/components/common";
import AIAnswer from "@/components/AIAnswer";

export default function Textbooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // book
  const [topic, setTopic] = useState(null); // {id, name}
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    api.textbooks().then(({ data }) => setBooks(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const explain = async (t) => {
    setTopic(t);
    setAiLoading(true);
    setAiText("");
    try {
      const { data } = await api.aiExplain({ topic_id: t.id, mode: "default" });
      setAiText(data.answer);
    } finally { setAiLoading(false); }
  };

  if (loading) return <Loader full />;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Мои учебники</h1>
      <p className="text-[#4B5563] mt-1 mb-6">Выбери материал и тему — Фили объяснит, если что-то непонятно.</p>

      {!active ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {books.map((b) => (
            <button key={b.id} onClick={() => setActive(b)} data-testid={`textbook-${b.id}`}
              className="ls-card p-6 text-left hover:shadow-lg transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-[#F6EFDA] flex items-center justify-center mb-4">
                <Library className="w-5 h-5 text-[#B0862A]" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">{b.title}</h3>
              <p className="text-sm text-[#4B5563] mt-1">{b.description}</p>
              <div className="text-xs text-[#8A94A6] mt-3">{b.topics.length} тем</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[300px,1fr] gap-6">
          <div>
            <button onClick={() => { setActive(null); setTopic(null); setAiText(""); }} className="text-sm text-[#B0862A] font-medium mb-3">← Все учебники</button>
            <div className="ls-card p-5">
              <h3 className="font-display font-semibold text-[#1E2A4A] mb-3">{active.title}</h3>
              <div className="space-y-2">
                {active.topics.map((tid, i) => {
                  const name = active.topic_names?.[i] || tid;
                  return (
                    <button key={tid} onClick={() => explain({ id: tid, name })} data-testid={`textbook-topic-${tid}`}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 ${topic?.id === tid ? "bg-[#F6EFDA] text-[#B0862A]" : "text-[#4B5563] hover:bg-[#F0EBE1]"}`}>
                      <BookOpen className="w-4 h-4 shrink-0" /> {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ls-card p-6 min-h-[300px]">
            {!topic ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Wizard size={72} />
                <p className="text-[#4B5563] mt-4 max-w-sm">Выбери тему слева, и я объясню её простым языком.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Wizard size={40} />
                    <div>
                      <div className="font-display font-semibold text-[#1E2A4A]">{topic.name}</div>
                      <div className="text-xs text-[#8A94A6]">Объяснение от Фили</div>
                    </div>
                  </div>
                  <button onClick={() => explain(topic)} disabled={aiLoading} data-testid="textbook-explain-btn"
                    className="btn-accent text-sm inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Я не понимаю эту тему</button>
                </div>
                <AIAnswer text={aiText} loading={aiLoading} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
