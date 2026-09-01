import React from "react";
import { Loader2 } from "lucide-react";

export const MASCOT = "/mascot.png";
export const LOGO = "/logo.jpeg";

export function Wizard({ size = 48, className = "", float = false }) {
  return (
    <img
      src={MASCOT}
      alt="Фили — ИИ-репетитор"
      style={{ width: size, height: size }}
      className={`rounded-full object-cover ${float ? "animate-float" : ""} ${className}`}
      data-testid="wizard-mascot"
    />
  );
}

export function Logo({ withText = true, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img src={MASCOT} alt="LightStudy" className="w-9 h-9 rounded-xl object-cover" />
      {withText && (
        <span className="font-display font-extrabold text-lg tracking-tight text-[#1E2A4A]">
          LightStudy
        </span>
      )}
    </div>
  );
}

export function Loader({ label = "Загрузка…", full = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-[#8A94A6] ${full ? "min-h-[60vh]" : "py-16"}`}
      data-testid="loader"
    >
      <Loader2 className="w-7 h-7 animate-spin text-[#7C66DC]" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, testId }) {
  return (
    <div className="ls-card p-10 flex flex-col items-center text-center gap-3" data-testid={testId || "empty-state"}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-[#F0EBE1] flex items-center justify-center">
          <Icon className="w-7 h-7 text-[#7C66DC]" />
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-[#1E2A4A]">{title}</h3>
      {description && <p className="text-[#4B5563] max-w-md">{description}</p>}
      {action}
    </div>
  );
}

export function DonutRing({ value = 0, size = 130, stroke = 12, color = "#7C66DC", label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDE6D6" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-extrabold text-[#1E2A4A]">{label ?? `${value}%`}</span>
        {sub && <span className="text-xs text-[#8A94A6] mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

export const DIFFICULTY = {
  easy: { label: "Лёгкий", color: "#10B981", bg: "#ECFDF5" },
  medium: { label: "Средний", color: "#F59E0B", bg: "#FEF3C7" },
  hard: { label: "Сложный", color: "#EF4444", bg: "#FEE2E2" },
  ege: { label: "ЕГЭ", color: "#7C66DC", bg: "#EEEAFB" },
};

export function DifficultyBadge({ level }) {
  const d = DIFFICULTY[level] || DIFFICULTY.medium;
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ color: d.color, background: d.bg }}
      data-testid="difficulty-badge"
    >
      {d.label}
    </span>
  );
}

export const ACTIVITY_LABEL = {
  lesson: "Урок", practice: "Практика", test: "Тест", review: "Повторение", mock_exam: "Пробник",
};

export function masteryColor(m) {
  if (m >= 75) return "#10B981";
  if (m >= 50) return "#F59E0B";
  return "#EF4444";
}
