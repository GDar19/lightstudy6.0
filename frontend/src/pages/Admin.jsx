import React, { useEffect, useState } from "react";
import { Shield, Users, HelpCircle, BarChart3, BookOpen, Database, ListOrdered } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Loader, EmptyState } from "@/components/common";
import KnowledgeBase from "@/pages/KnowledgeBase";
import AdminTasks from "@/pages/AdminTasks";
import AdminCurriculum from "@/pages/AdminCurriculum";

const TABS = [
  { id: "stats", label: "Дашборд", icon: BarChart3 },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "subjects", label: "Предметы", icon: BookOpen },
  { id: "curriculum", label: "Программа", icon: ListOrdered },
  { id: "kb", label: "База знаний", icon: Database },
  { id: "questions", label: "Задания", icon: HelpCircle },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectsAll, setSubjectsAll] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") { setLoading(false); return; }
    Promise.all([api.adminStats(), api.adminUsers(), api.subjects(), api.adminTopics(), api.adminSubjectsAll()]).then(([s, u, sub, t, sa]) => {
      setStats(s.data); setUsers(u.data); setSubjects(sub.data); setTopics(t.data); setSubjectsAll(sa.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const toggleSubj = async (sid, enabled) => {
    await api.toggleSubject(sid, enabled);
    setSubjectsAll((list) => list.map((s) => s.id === sid ? { ...s, enabled } : s));
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

      {tab === "kb" && <KnowledgeBase subjects={subjects} />}

      {tab === "subjects" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjectsAll.map((s) => (
            <div key={s.id} className="ls-card p-5 flex items-center justify-between" data-testid={`admin-subject-${s.id}`}>
              <div>
                <div className="font-medium text-[#1E2A4A]">{s.name}</div>
                <div className="text-xs text-[#8A94A6]">{s.exam_type || "—"}</div>
              </div>
              <button onClick={() => toggleSubj(s.id, !(s.enabled !== false))} data-testid={`toggle-subject-${s.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${s.enabled !== false ? "bg-[#ECFDF5] text-[#10B981]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
                {s.enabled !== false ? "Включён" : "Выключен"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "questions" && <AdminTasks subjects={subjects} topics={topics} />}
      {tab === "curriculum" && <AdminCurriculum subjects={subjects} />}
    </div>
  );
}
