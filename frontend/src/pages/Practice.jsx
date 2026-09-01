import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Dumbbell, RotateCcw, ArrowRight, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader, DonutRing, masteryColor } from "@/components/common";
import QuestionRunner from "@/components/QuestionRunner";

function Picker({ onStart }) {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.subjects().then(({ data }) => {
      const mine = data.filter((s) => s.selected);
      setSubjects(mine.length ? mine : data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!subject) { setTopics([]); return; }
    api.subject(subject).then(({ data }) => {
      const t = [];
      data.sections.forEach((sec) => sec.topics.forEach((tp) => tp.question_count > 0 && t.push(tp)));
      setTopics(t);
    });
  }, [subject]);

  if (loading) return <Loader />;

  return (
    <div className="max-w-lg mx-auto ls-card p-7">
      <h2 className="font-display text-xl font-bold text-[#1E2A4A] mb-1">Начать практику</h2>
      <p className="text-sm text-[#8A94A6] mb-5">Выбери предмет и тему для тренировки.</p>
      <label className="text-sm font-medium text-[#1E2A4A]">Предмет</label>
      <select data-testid="practice-subject-select" value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(""); }}
        className="mt-1.5 mb-4 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]">
        <option value="">— выбери —</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {subject && (
        <>
          <label className="text-sm font-medium text-[#1E2A4A]">Тема</label>
          <select data-testid="practice-topic-select" value={topic} onChange={(e) => setTopic(e.target.value)}
            className="mt-1.5 mb-5 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]">
            <option value="">Все темы предмета</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>
      )}
      <button disabled={!subject} onClick={() => onStart(subject, topic)} data-testid="start-practice-btn"
        className="btn-accent w-full inline-flex items-center justify-center gap-2 disabled:opacity-50">
        <Dumbbell className="w-4 h-4" /> Начать
      </button>
    </div>
  );
}

export default function Practice() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null);

  const start = async (subject, topic, mode = "adaptive") => {
    setStarting(true);
    setResult(null);
    try {
      const { data } = await api.startPractice({ subject_id: subject, topic_id: topic || null, mode });
      setSession(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Не удалось начать практику");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const subject = params.get("subject");
    const topic = params.get("topic");
    const mode = params.get("mode") || "adaptive";
    if (subject) start(subject, topic, mode);
    // eslint-disable-next-line
  }, []);

  const onAnswer = async (q, i) => {
    const { data } = await api.practiceAnswer({ session_id: session.session_id, question_id: q.id, answer: i });
    return data;
  };

  const onFinish = async () => {
    try {
      const { data } = await api.finishPractice(session.session_id);
      setResult(data);
      setSession(null);
    } catch { toast.error("Ошибка"); }
  };

  const askAI = (q) => {
    navigate(`/app/tutor?topic=${q.topic_id}&q=${encodeURIComponent("Помоги разобраться: " + q.question)}`);
  };

  if (starting) return <Loader full label="Готовим задания…" />;

  if (result) {
    return (
      <div className="max-w-lg mx-auto animate-fade-up">
        <div className="ls-card p-8 text-center">
          <Trophy className="w-12 h-12 text-[#F59E0B] mx-auto mb-3" />
          <h2 className="font-display text-2xl font-extrabold text-[#1E2A4A]">Практика завершена!</h2>
          <div className="my-6 flex justify-center">
            <DonutRing value={result.accuracy} size={140} color={masteryColor(result.accuracy)} sub="точность" />
          </div>
          <p className="text-[#4B5563]">Правильно {result.correct} из {result.total}</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-7">
            <button onClick={() => setResult(null)} className="btn-accent flex-1 inline-flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Ещё практика
            </button>
            <Link to="/app" className="px-6 py-3 rounded-xl font-semibold border border-[#1E2A4A]/15 text-[#1E2A4A] hover:bg-white inline-flex items-center justify-center gap-2">
              На главную <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Практика</h1>
        <Picker onStart={start} />
      </div>
    );
  }

  return (
    <div className="py-2">
      <QuestionRunner
        questions={session.questions}
        onAnswer={onAnswer}
        onFinish={onFinish}
        title="Практика"
        subtitle="Сложность подстраивается под тебя"
        showAskAI={askAI}
      />
    </div>
  );
}
