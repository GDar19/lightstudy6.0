import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ArrowRight, ArrowLeft, Compass } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Wizard, Loader } from "@/components/common";

const CONFIDENCE = [
  { v: "low", label: "Только начинаю" },
  { v: "medium", label: "Кое-что знаю" },
  { v: "high", label: "Чувствую уверенно" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { patchUser } = useAuth();
  const [step, setStep] = useState(1);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [count, setCount] = useState(3);
  const [selected, setSelected] = useState([]);
  const [targetScore, setTargetScore] = useState(80);
  const [examDate, setExamDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [confidence, setConfidence] = useState("medium");

  useEffect(() => {
    api.subjects().then(({ data }) => setSubjects(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const finish = async () => {
    setSaving(true);
    try {
      const { data } = await api.onboarding({
        subjects: selected, subject_count: count, target_score: targetScore,
        exam_date: examDate || null, daily_minutes: dailyMinutes, confidence,
      });
      patchUser(data);
      toast.success("Профиль сохранён!");
      navigate(`/app/diagnostic/${selected[0]}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader full />;

  const canNext = step === 2 ? selected.length > 0 : true;

  return (
    <div className="min-h-screen bg-[#F8F5EE] ls-gradient-hero flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-2xl">
        {/* progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${s <= step ? "bg-[#B0862A]" : "bg-[#E5DEC9]"}`} />
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="ls-card p-8">
          {step === 1 && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <Wizard size={64} />
                <div>
                  <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A]">Сколько предметов ты планируешь сдавать?</h1>
                  <p className="text-[#4B5563] text-sm mt-1">Выбери примерное количество</p>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} data-testid={`count-${n}`} onClick={() => setCount(n)}
                    className={`aspect-square rounded-2xl font-display text-2xl font-bold transition-all ${count === n ? "bg-[#C9A227] text-[#1E2A4A] shadow-md scale-105" : "bg-[#F0EBE1] text-[#1E2A4A] hover:bg-[#E2DACB]"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A]">Какие предметы ты сдаёшь?</h1>
              <p className="text-[#4B5563] text-sm mt-1 mb-6">Выбрано: {selected.length}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {subjects.map((s) => {
                  const active = selected.includes(s.id);
                  return (
                    <button key={s.id} data-testid={`subject-select-${s.id}`} onClick={() => toggle(s.id)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${active ? "border-[#B0862A] bg-[#F6EFDA]" : "border-[#E5DEC9] bg-[#FAF8F3] hover:border-[#E7D5A2]"}`}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: active ? "#B0862A" : "#E5DEC9" }}>
                        {active && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="font-medium text-[#1E2A4A]">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A]">Расскажи о своих целях</h1>
              <div>
                <label className="text-sm font-medium text-[#1E2A4A]">Целевой балл: <span className="text-[#B0862A] font-bold">{targetScore}</span></label>
                <input data-testid="target-score" type="range" min="40" max="100" value={targetScore} onChange={(e) => setTargetScore(+e.target.value)}
                  className="w-full mt-2 accent-[#B0862A]" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1E2A4A]">Дата экзамена</label>
                <input data-testid="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                  className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1E2A4A]">Время на учёбу в день: <span className="text-[#B0862A] font-bold">{dailyMinutes} мин</span></label>
                <input data-testid="daily-minutes" type="range" min="15" max="240" step="15" value={dailyMinutes} onChange={(e) => setDailyMinutes(+e.target.value)}
                  className="w-full mt-2 accent-[#B0862A]" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1E2A4A]">Насколько ты уверен в знаниях?</label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {CONFIDENCE.map((c) => (
                    <button key={c.v} data-testid={`confidence-${c.v}`} onClick={() => setConfidence(c.v)}
                      className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${confidence === c.v ? "bg-[#C9A227] text-[#1E2A4A]" : "bg-[#F0EBE1] text-[#1E2A4A] hover:bg-[#E2DACB]"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-4">
              <Wizard size={96} float className="mx-auto" />
              <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A] mt-6">Теперь определим твой текущий уровень</h1>
              <p className="text-[#4B5563] mt-3 max-w-md mx-auto">
                Пройди короткую диагностику по предмету «{subjects.find((s) => s.id === selected[0])?.name}»,
                чтобы мы составили персональный план. Остальные предметы можно продиагностировать позже.
              </p>
              <button data-testid="start-diagnostic-btn" onClick={finish} disabled={saving}
                className="btn-accent inline-flex items-center gap-2 mt-8 disabled:opacity-60">
                <Compass className="w-5 h-5" /> {saving ? "Сохраняем…" : "Начать диагностику"}
              </button>
            </div>
          )}

          {step < 4 && (
            <div className="flex items-center justify-between mt-8">
              <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
                data-testid="onboarding-back" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[#4B5563] font-medium hover:bg-[#F0EBE1] disabled:opacity-40">
                <ArrowLeft className="w-4 h-4" /> Назад
              </button>
              <button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}
                data-testid="onboarding-next" className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                Далее <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
