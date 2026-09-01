import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Award, LogOut, Check } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Loader, Wizard } from "@/components/common";
import * as Icons from "lucide-react";

function AchIcon({ name, earned }) {
  const map = { compass: Icons.Compass, "book-open": Icons.BookOpen, target: Icons.Target, trophy: Icons.Trophy, flame: Icons.Flame, star: Icons.Star, "clipboard-check": Icons.ClipboardCheck };
  const Icon = map[name] || Icons.Award;
  return (
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${earned ? "bg-[#EEEAFB]" : "bg-[#F0EBE1] opacity-50"}`}>
      <Icon className={`w-6 h-6 ${earned ? "text-[#7C66DC]" : "text-[#8A94A6]"}`} />
    </div>
  );
}

export default function Profile() {
  const { user, patchUser, logout } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || "", target_score: user?.target_score || 80,
    exam_date: user?.exam_date || "", daily_minutes: user?.daily_minutes || 60,
    subjects: user?.subjects || [], notifications_enabled: user?.notifications_enabled ?? true,
  });

  useEffect(() => {
    Promise.all([api.subjects(), api.achievements()]).then(([s, a]) => {
      setSubjects(s.data); setAchievements(a.data);
    }).finally(() => setLoading(false));
  }, []);

  const toggleSubject = (id) => setForm((f) => ({ ...f, subjects: f.subjects.includes(id) ? f.subjects.filter((x) => x !== id) : [...f.subjects, id] }));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.updateProfile(form);
      patchUser(data);
      toast.success("Профиль сохранён!");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const doLogout = async () => { await logout(); navigate("/login"); };

  if (loading) return <Loader full />;
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <div className="animate-fade-up max-w-4xl">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Профиль и настройки</h1>

      <div className="ls-card p-6 mb-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#7C66DC] flex items-center justify-center text-white font-display font-bold text-2xl">
          {(user?.name || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="font-display text-xl font-bold text-[#1E2A4A]">{user?.name}</div>
          <div className="text-sm text-[#8A94A6]">{user?.email}</div>
        </div>
        <button onClick={doLogout} data-testid="profile-logout-btn" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[#EF4444] font-medium hover:bg-[#FEE2E2]">
          <LogOut className="w-4 h-4" /> Выйти
        </button>
      </div>

      {/* Settings */}
      <div className="ls-card p-6 mb-6">
        <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-5">Настройки</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Имя</label>
            <input data-testid="profile-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Дата экзамена</label>
            <input data-testid="profile-exam-date" type="date" value={form.exam_date || ""} onChange={(e) => setForm((f) => ({ ...f, exam_date: e.target.value }))}
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#7C66DC]" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Целевой балл: <span className="text-[#7C66DC] font-bold">{form.target_score}</span></label>
            <input data-testid="profile-target" type="range" min="40" max="100" value={form.target_score} onChange={(e) => setForm((f) => ({ ...f, target_score: +e.target.value }))} className="w-full mt-3 accent-[#7C66DC]" />
          </div>
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Время в день: <span className="text-[#7C66DC] font-bold">{form.daily_minutes} мин</span></label>
            <input type="range" min="15" max="240" step="15" value={form.daily_minutes} onChange={(e) => setForm((f) => ({ ...f, daily_minutes: +e.target.value }))} className="w-full mt-3 accent-[#7C66DC]" />
          </div>
        </div>

        <div className="mt-5">
          <label className="text-sm font-medium text-[#1E2A4A]">Предметы</label>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => toggleSubject(s.id)} data-testid={`profile-subject-${s.id}`}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border-2 text-left ${form.subjects.includes(s.id) ? "border-[#7C66DC] bg-[#EEEAFB]" : "border-[#E5DEC9] bg-[#FAF8F3]"}`}>
                <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: form.subjects.includes(s.id) ? "#7C66DC" : "#E5DEC9" }}>
                  {form.subjects.includes(s.id) && <Check className="w-3 h-3 text-white" />}
                </div>
                {s.short}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 mt-5 cursor-pointer">
          <input type="checkbox" checked={form.notifications_enabled} onChange={(e) => setForm((f) => ({ ...f, notifications_enabled: e.target.checked }))} className="w-4 h-4 accent-[#7C66DC]" data-testid="profile-notifications" />
          <span className="text-sm text-[#1E2A4A]">Получать уведомления и напоминания</span>
        </label>

        <button onClick={save} disabled={saving} data-testid="profile-save-btn" className="btn-primary inline-flex items-center gap-2 mt-6 disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>

      {/* Achievements */}
      <div className="ls-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Award className="w-5 h-5 text-[#7C66DC]" />
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">Достижения ({earnedCount}/{achievements.length})</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <div key={a.code} className="flex items-center gap-3" data-testid={`achievement-${a.code}`}>
              <AchIcon name={a.icon} earned={a.earned} />
              <div>
                <div className={`font-medium ${a.earned ? "text-[#1E2A4A]" : "text-[#8A94A6]"}`}>{a.title}</div>
                <div className="text-xs text-[#8A94A6]">{a.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
