import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { api } from "@/api/client";
import { Loader, DonutRing, Wizard, masteryColor } from "@/components/common";

export default function DiagnosticResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.diagnosticResults(id).then(({ data }) => setRes(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const createPlan = async () => {
    setGenerating(true);
    try {
      await api.generatePlan();
      toast.success("Персональный план создан!");
      navigate("/app/plan");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка создания плана");
      setGenerating(false);
    }
  };

  if (loading) return <Loader full />;
  if (!res) return null;

  return (
    <div className="max-w-3xl mx-auto animate-fade-up">
      <div className="flex items-center gap-4 mb-6">
        <Wizard size={56} />
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Результаты диагностики</h1>
          <p className="text-[#4B5563]">{res.subject_name}</p>
        </div>
      </div>

      <div className="ls-card p-7 grid sm:grid-cols-[auto,1fr] gap-8 items-center">
        <div className="flex flex-col items-center">
          <DonutRing value={res.score} size={150} label={`${res.score}%`} sub="результат" color={masteryColor(res.score)} />
          <div className="mt-3 text-center">
            <div className="text-xs text-[#8A94A6]">Твой уровень</div>
            <div className="font-display font-bold text-[#1E2A4A]" data-testid="diagnostic-level">{res.level}</div>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#10B981] mb-2"><CheckCircle2 className="w-4 h-4" /> Сильные стороны</div>
            <div className="flex flex-wrap gap-2">
              {res.strong.length ? res.strong.map((t) => (
                <span key={t.topic_id} className="px-3 py-1.5 rounded-full bg-[#ECFDF5] text-[#10B981] text-sm font-medium">{t.name}</span>
              )) : <span className="text-sm text-[#8A94A6]">Продолжай практиковаться!</span>}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#EF4444] mb-2"><AlertCircle className="w-4 h-4" /> Слабые темы</div>
            <div className="flex flex-wrap gap-2">
              {res.weak.length ? res.weak.map((t) => (
                <span key={t.topic_id} className="px-3 py-1.5 rounded-full bg-[#FEE2E2] text-[#EF4444] text-sm font-medium">{t.name}</span>
              )) : <span className="text-sm text-[#8A94A6]">Слабых тем не выявлено!</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="ls-card p-7 mt-5">
        <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-4">Уровень по темам</h2>
        <div className="space-y-3">
          {res.topics.map((t) => (
            <div key={t.topic_id}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[#1E2A4A] font-medium">{t.name}</span>
                <span className="text-[#8A94A6]">{t.mastery}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#EDE6D6] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${t.mastery}%`, background: masteryColor(t.mastery) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {res.recommendations?.length > 0 && (
        <div className="ls-card p-6 mt-5 flex gap-4 bg-[#EEEAFB]/40">
          <Sparkles className="w-6 h-6 text-[#7C66DC] shrink-0" />
          <div>
            <div className="font-semibold text-[#1E2A4A]">Рекомендации</div>
            <p className="text-sm text-[#4B5563] mt-1">Рекомендуем уделить больше времени темам: {res.recommendations.join(", ")}.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-7">
        <button onClick={createPlan} disabled={generating} data-testid="create-plan-btn" className="btn-accent flex-1 disabled:opacity-60">
          {generating ? "Создаём план…" : "Создать мой план"}
        </button>
        <button onClick={() => navigate("/app")} className="px-6 py-3 rounded-xl font-semibold border border-[#1E2A4A]/15 text-[#1E2A4A] hover:bg-white">
          На главную
        </button>
      </div>
    </div>
  );
}
