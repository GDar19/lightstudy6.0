import React, { useEffect, useState } from "react";
import { Shield, Users, HelpCircle, BarChart3, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Loader, EmptyState, DifficultyBadge } from "@/components/common";

const TABS = [
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "questions", label: "Вопросы", icon: HelpCircle },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filterSubject, setFilterSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject_id: "", topic_id: "", difficulty: "medium", question: "", options: ["", "", "", ""], answer: 0, explanation: "", ege_category: "" });

  useEffect(() => {
    if (user?.role !== "admin") { setLoading(false); return; }
    Promise.all([api.adminStats(), api.adminUsers(), api.subjects(), api.adminTopics()]).then(([s, u, sub, t]) => {
      setStats(s.data); setUsers(u.data); setSubjects(sub.data); setTopics(t.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const loadQuestions = (subj) => api.adminQuestions(subj || undefined).then(({ data }) => setQuestions(data));
  useEffect(() => { if (tab === "questions" && user?.role === "admin") loadQuestions(filterSubject); }, [tab, filterSubject]);

  const del = async (id) => {
    await api.deleteQuestion(id);
    setQuestions((q) => q.filter((x) => x.id !== id));
    toast.success("Вопрос удалён");
  };

  const create = async () => {
    try {
      await api.createQuestion(form);
      toast.success("Вопрос добавлен");
      setShowForm(false);
      loadQuestions(filterSubject);
      setForm({ subject_id: "", topic_id: "", difficulty: "medium", question: "", options: ["", "", "", ""], answer: 0, explanation: "", ege_category: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (loading) return <Loader full />;
  if (user?.role !== "admin") return <EmptyState icon={Shield} title="Доступ запрещён" description="Эта страница только для администраторов." />;

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-[#7C66DC]" />
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Админ-панель</h1>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`admin-tab-${t.id}`}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === t.id ? "bg-[#7C66DC] text-white" : "bg-[#F0EBE1] text-[#1E2A4A] hover:bg-[#E2DACB]"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "stats" && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[["Учеников", stats.users], ["Вопросов", stats.questions], ["Предметов", stats.subjects], ["Уроков", stats.lessons], ["Диагностик", stats.diagnostics], ["Решено заданий", stats.practice_attempts], ["Пробников", stats.mock_exams]].map(([l, v]) => (
            <div key={l} className="ls-card p-5">
              <div className="font-display text-2xl font-extrabold text-[#1E2A4A]">{v}</div>
              <div className="text-xs text-[#8A94A6] mt-1">{l}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="ls-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF8F3] text-[#8A94A6]">
              <tr><th className="text-left px-5 py-3 font-medium">Имя</th><th className="text-left px-5 py-3 font-medium">Email</th><th className="text-left px-5 py-3 font-medium">Роль</th><th className="text-left px-5 py-3 font-medium">Предметы</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#E5DEC9]" data-testid={`admin-user-${u.id}`}>
                  <td className="px-5 py-3 text-[#1E2A4A] font-medium">{u.name}</td>
                  <td className="px-5 py-3 text-[#4B5563]">{u.email}</td>
                  <td className="px-5 py-3">{u.role === "admin" ? <span className="text-[#7C66DC] font-medium">admin</span> : "student"}</td>
                  <td className="px-5 py-3 text-[#8A94A6]">{(u.subjects || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "questions" && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} data-testid="admin-subject-filter"
              className="px-4 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]">
              <option value="">Все предметы</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => setShowForm((s) => !s)} data-testid="admin-add-question-btn" className="btn-accent inline-flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Добавить вопрос
            </button>
            <span className="text-sm text-[#8A94A6]">Всего: {questions.length}</span>
          </div>

          {showForm && (
            <div className="ls-card p-5 mb-4 space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <select value={form.subject_id} onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value, topic_id: "" }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="admin-q-subject">
                  <option value="">Предмет…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={form.topic_id} onChange={(e) => setForm((f) => ({ ...f, topic_id: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="admin-q-topic">
                  <option value="">Тема…</option>
                  {topics.filter((t) => !form.subject_id || t.subject_id === form.subject_id).map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
                </select>
                <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
                  <option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option><option value="ege">ege</option>
                </select>
              </div>
              <input placeholder="Текст вопроса" value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="admin-q-text" />
              <div className="text-xs text-[#8A94A6]">Отметь правильный вариант точкой слева:</div>
              {form.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" checked={form.answer === i} onChange={() => setForm((f) => ({ ...f, answer: i }))} className="accent-[#7C66DC]" title="Правильный ответ" />
                  <input placeholder={`Вариант ${i + 1}`} value={o} onChange={(e) => setForm((f) => { const opts = [...f.options]; opts[i] = e.target.value; return { ...f, options: opts }; })} className="flex-1 px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid={`admin-q-option-${i}`} />
                </div>
              ))}
              <input placeholder="Объяснение" value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
              <input placeholder="Категория ЕГЭ (необязательно)" value={form.ege_category} onChange={(e) => setForm((f) => ({ ...f, ege_category: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
              <button onClick={create} data-testid="admin-q-save" className="btn-primary">Сохранить вопрос</button>
            </div>
          )}

          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="ls-card p-4 flex items-start justify-between gap-4" data-testid={`admin-question-${q.id}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1"><DifficultyBadge level={q.difficulty} /><span className="text-xs text-[#8A94A6]">{q.subject_id} · {q.topic_id}</span></div>
                  <div className="text-[#1E2A4A] font-medium">{q.question}</div>
                  <div className="text-xs text-[#10B981] mt-1">Ответ: {q.options[q.answer]}</div>
                </div>
                <button onClick={() => del(q.id)} data-testid={`admin-delete-${q.id}`} className="p-2 rounded-lg text-[#EF4444] hover:bg-[#FEE2E2]"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
