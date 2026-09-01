import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, Circle, RefreshCw, Compass } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader, EmptyState, DifficultyBadge, ACTIVITY_LABEL } from "@/components/common";

export default function StudyPlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regen, setRegen] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.studyPlan().then(({ data }) => setPlan(data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const generate = async () => {
    setRegen(true);
    try { await api.generatePlan(); toast.success("План обновлён!"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Ошибка"); }
    finally { setRegen(false); }
  };

  const toggle = async (item) => {
    const status = item.status === "done" ? "planned" : "done";
    await api.patchPlanItem(item.id, { status, completion: status === "done" ? 100 : 0 });
    setPlan((p) => ({ ...p, items: p.items.map((x) => x.id === item.id ? { ...x, status } : x) }));
  };

  const open = (item) => {
    if (item.activity_type === "lesson") navigate(`/app/topics/${item.topic_id}`);
    else navigate(`/app/practice?subject=${item.subject_id}&topic=${item.topic_id}`);
  };

  if (loading) return <Loader full />;

  if (!plan?.has_plan) {
    return (
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A] mb-6">Мой план</h1>
        <EmptyState icon={Compass} title="Плана пока нет"
          description="Пройди диагностику, чтобы мы составили персональный план подготовки."
          testId="plan-empty"
          action={<button onClick={generate} disabled={regen} className="btn-accent mt-2">{regen ? "Создаём…" : "Сгенерировать план"}</button>} />
      </div>
    );
  }

  // group by date
  const groups = {};
  plan.items.forEach((it) => { (groups[it.date] = groups[it.date] || []).push(it); });
  const dates = Object.keys(groups).sort();

  const doneCount = plan.items.filter((i) => i.status === "done").length;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Мой план</h1>
          <p className="text-[#4B5563] mt-1">Выполнено {doneCount} из {plan.items.length} заданий</p>
        </div>
        <button onClick={generate} disabled={regen} data-testid="regenerate-plan-btn"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium border border-[#7C66DC]/30 text-[#7C66DC] hover:bg-[#EEEAFB] self-start">
          <RefreshCw className={`w-4 h-4 ${regen ? "animate-spin" : ""}`} /> Обновить план
        </button>
      </div>

      <div className="space-y-6">
        {dates.map((date) => {
          const d = new Date(date);
          const label = groups[date][0].day;
          return (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4 text-[#7C66DC]" />
                <span className="font-display font-semibold text-[#1E2A4A]">{label}</span>
                <span className="text-sm text-[#8A94A6]">{d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
              </div>
              <div className="space-y-3">
                {groups[date].map((it) => (
                  <div key={it.id} className={`ls-card p-4 flex items-center gap-3 ${it.status === "done" ? "opacity-70" : ""}`} data-testid={`plan-item-${it.id}`}>
                    <button onClick={() => toggle(it)} data-testid={`plan-toggle-${it.id}`} className="shrink-0">
                      {it.status === "done"
                        ? <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>
                        : <Circle className="w-6 h-6 text-[#C5BCFA]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-[#1E2A4A] ${it.status === "done" ? "line-through" : ""}`}>{it.subject_name} · {it.topic_name}</div>
                      <div className="text-xs text-[#8A94A6] flex items-center gap-2 mt-0.5">
                        {ACTIVITY_LABEL[it.activity_type]} · {it.duration} мин <DifficultyBadge level={it.difficulty} />
                      </div>
                    </div>
                    {it.status !== "done" && (
                      <button onClick={() => open(it)} className="btn-primary text-sm py-2 px-4">Начать</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
