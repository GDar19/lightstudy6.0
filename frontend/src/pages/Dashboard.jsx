import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Flame, Target, CheckCircle2, TrendingUp, Compass, ArrowRight,
  Sparkles, AlertTriangle, PlayCircle,
} from "lucide-react";
import { api } from "@/api/client";
import { Loader, DonutRing, Wizard, EmptyState, masteryColor, ACTIVITY_LABEL, DifficultyBadge } from "@/components/common";

function StatCard({ icon: Icon, label, value, sub, color = "#7C66DC" }) {
  return (
    <div className="ls-card p-5" data-testid="stat-card">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold text-[#1E2A4A] leading-none">{value}</div>
          <div className="text-xs text-[#8A94A6] mt-1">{label}</div>
        </div>
      </div>
      {sub && <div className="text-xs text-[#8A94A6] mt-3">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboard().then(({ data }) => setData(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader full />;
  if (!data) return null;

  const startTask = (item) => {
    if (item.activity_type === "lesson") navigate(`/app/topics/${item.topic_id}`);
    else navigate(`/app/practice?subject=${item.subject_id}&topic=${item.topic_id}`);
  };

  return (
    <div className="animate-fade-up">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Wizard size={56} float />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]" data-testid="dashboard-greeting">Привет, {data.name}!</h1>
            {data.days_until_exam != null ? (
              <p className="text-[#4B5563]">До ЕГЭ осталось <span className="font-semibold text-[#7C66DC]">{data.days_until_exam}</span> дн.</p>
            ) : (
              <p className="text-[#4B5563]">Продолжаем подготовку 💪</p>
            )}
          </div>
        </div>
        <Link to="/app/tutor" className="btn-accent inline-flex items-center gap-2 self-start" data-testid="dashboard-ask-ai">
          <Sparkles className="w-4 h-4" /> Спросить ИИ
        </Link>
      </div>

      {!data.has_diagnostics && (
        <div className="ls-card p-6 mb-6 flex flex-col sm:flex-row items-center gap-5 ls-gradient-hero" data-testid="diagnostic-prompt">
          <Compass className="w-10 h-10 text-[#7C66DC]" />
          <div className="flex-1 text-center sm:text-left">
            <div className="font-display font-semibold text-lg text-[#1E2A4A]">Пройди диагностику</div>
            <p className="text-sm text-[#4B5563]">Мы определим твой уровень и составим персональный план.</p>
          </div>
          <Link to="/app/subjects" className="btn-primary">Начать</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={TrendingUp} label="Общий прогресс" value={`${data.overall_progress}%`} color="#7C66DC" />
        <StatCard icon={CheckCircle2} label="Заданий решено" value={data.tasks_completed} color="#10B981" />
        <StatCard icon={Flame} label="Серия дней" value={data.streak} color="#F59E0B" />
        <StatCard icon={Target} label="Средний результат" value={`${data.accuracy}%`} color="#3B82F6" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <div className="ls-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">Сегодня</h2>
              <Link to="/app/plan" className="text-sm text-[#7C66DC] font-medium hover:underline">Весь план</Link>
            </div>
            {data.today_tasks.length === 0 ? (
              <EmptyState icon={Compass} title="Заданий на сегодня нет" description={data.has_diagnostics ? "Создай персональный план, чтобы получить задания на каждый день." : "Пройди диагностику и создай план, чтобы получить задания."} testId="today-empty"
                action={<Link to={data.has_diagnostics ? "/app/plan" : "/app/subjects"} className="btn-accent mt-2">{data.has_diagnostics ? "К плану" : "К предметам"}</Link>} />
            ) : (
              <div className="space-y-3" data-testid="today-tasks">
                {data.today_tasks.map((t) => (
                  <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#EEEAFB] flex items-center justify-center shrink-0">
                        <PlayCircle className="w-5 h-5 text-[#7C66DC]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#1E2A4A] truncate">{t.subject_name} · {t.topic_name}</div>
                        <div className="text-xs text-[#8A94A6] flex items-center gap-2 mt-0.5 flex-wrap">
                          {ACTIVITY_LABEL[t.activity_type]} · {t.duration} мин <DifficultyBadge level={t.difficulty} />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => startTask(t)} data-testid={`start-task-${t.id}`} className="btn-primary text-sm py-2 px-4 inline-flex items-center justify-center gap-1.5 shrink-0 w-full sm:w-auto">
                      Начать <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weak topics */}
          <div className="ls-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">Твои слабые темы</h2>
            </div>
            {data.weak_topics.length === 0 ? (
              <p className="text-sm text-[#8A94A6]">Пока данных нет — реши несколько заданий.</p>
            ) : (
              <div className="space-y-3">
                {data.weak_topics.map((k) => (
                  <Link key={k.topic_id} to={`/app/topics/${k.topic_id}`} className="flex items-center gap-3 group">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[#1E2A4A] font-medium group-hover:text-[#7C66DC]">{k.topic_name}</span>
                        <span className="text-[#8A94A6]">{k.mastery}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#EDE6D6] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${k.mastery}%`, background: masteryColor(k.mastery) }} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side */}
        <div className="space-y-6 min-w-0">
          <div className="ls-card p-6 flex flex-col items-center">
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A] self-start mb-4">Общий прогресс</h2>
            <DonutRing value={data.overall_progress} size={150} sub="освоено" />
            {data.target_score && <div className="text-sm text-[#8A94A6] mt-4">Цель: <span className="font-semibold text-[#1E2A4A]">{data.target_score} баллов</span></div>}
          </div>

          <div className="ls-card p-6">
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Мои предметы</h2>
            {data.subjects.length === 0 ? (
              <p className="text-sm text-[#8A94A6]">Предметы не выбраны.</p>
            ) : (
              <div className="space-y-3">
                {data.subjects.map((s) => (
                  <Link key={s.id} to={`/app/subjects/${s.id}`} className="flex items-center justify-between p-3 rounded-xl hover:bg-[#FAF8F3] group">
                    <span className="font-medium text-[#1E2A4A] group-hover:text-[#7C66DC]">{s.short}</span>
                    <span className="text-sm font-semibold" style={{ color: masteryColor(s.mastery) }}>{s.mastery}%</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
