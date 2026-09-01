import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Cell,
} from "recharts";
import { BarChart3, TrendingUp, CheckCircle2, Flame, Target } from "lucide-react";
import { api } from "@/api/client";
import { Loader, EmptyState, DonutRing, masteryColor } from "@/components/common";

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="ls-card p-5 flex items-center gap-3" data-testid="stat-card">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="font-display text-xl font-extrabold text-[#1E2A4A]">{value}</div>
        <div className="text-xs text-[#8A94A6]">{label}</div>
      </div>
    </div>
  );
}

export default function Statistics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.statistics().then(({ data }) => setStats(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader full />;
  if (!stats) return null;

  const hasData = stats.tasks_completed > 0;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Статистика</h1>

      {!hasData ? (
        <EmptyState icon={BarChart3} title="Пока нет данных"
          description="Пройди диагностику и порешай задания — здесь появится твоя статистика прогресса." testId="stats-empty" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat icon={TrendingUp} label="Общий уровень" value={`${stats.overall_mastery}%`} color="#7C66DC" />
            <Stat icon={Target} label="Точность" value={`${stats.accuracy}%`} color="#3B82F6" />
            <Stat icon={CheckCircle2} label="Заданий решено" value={stats.tasks_completed} color="#10B981" />
            <Stat icon={Flame} label="Серия дней" value={stats.streak} color="#F59E0B" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="ls-card p-6">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Уровень по предметам</h2>
              {stats.subject_mastery.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.subject_mastery} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" vertical={false} />
                    <XAxis dataKey="subject" tick={{ fontSize: 11, fill: "#8A94A6" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#8A94A6" }} />
                    <Tooltip cursor={{ fill: "#F0EBE1" }} formatter={(v) => [`${v}%`, "Уровень"]} contentStyle={{ borderRadius: 12, border: "1px solid #E5DEC9" }} />
                    <Bar dataKey="mastery" radius={[8, 8, 0, 0]}>
                      {stats.subject_mastery.map((e, i) => <Cell key={i} fill={e.color || "#7C66DC"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-[#8A94A6]">Нет данных</p>}
            </div>

            <div className="ls-card p-6">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Прогресс во времени</h2>
              {stats.progress_over_time.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats.progress_over_time} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDE6D6" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: "#8A94A6" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#8A94A6" }} />
                    <Tooltip formatter={(v) => [`${v}%`, "Точность"]} labelFormatter={(l) => `Дата: ${l}`} contentStyle={{ borderRadius: 12, border: "1px solid #E5DEC9" }} />
                    <Line type="monotone" dataKey="accuracy" stroke="#7C66DC" strokeWidth={3} dot={{ r: 4, fill: "#7C66DC" }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-sm text-[#8A94A6] text-center">
                  Решай задания в разные дни, чтобы увидеть динамику
                </div>
              )}
            </div>

            <div className="ls-card p-6 flex flex-col items-center justify-center">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A] self-start mb-4">Общий уровень</h2>
              <DonutRing value={stats.overall_mastery} size={160} sub="освоено" />
            </div>

            <div className="ls-card p-6">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Слабые темы</h2>
              {stats.weak_topics.length ? (
                <div className="space-y-3">
                  {stats.weak_topics.map((k) => (
                    <div key={k.topic_id} data-testid="stats-weak-row">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[#1E2A4A] font-medium">{k.topic_name}</span>
                        <span className="text-[#8A94A6]">{k.mastery}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#EDE6D6] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${k.mastery}%`, background: masteryColor(k.mastery) }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-[#8A94A6]">Слабых тем не выявлено</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
