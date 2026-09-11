import React from "react";
import { Loader2 } from "lucide-react";
import { mediaUrl } from "@/api/client";

export const MASCOT = "/mascot.png";
export const LOGO = "/logo.jpeg";

// Renders task images/diagrams/graphs/tables as first-class content (reuses GridFS media via mediaUrl).
export function TaskImages({ images, className = "" }) {
  if (!images || images.length === 0) return null;
  return (
    <div className={`mt-4 grid gap-3 ${images.length > 1 ? "sm:grid-cols-2" : ""} ${className}`} data-testid="task-images">
      {images.map((img, i) => (
        <figure key={i} className="rounded-xl overflow-hidden border border-[#E5DEC9] bg-white">
          <img src={mediaUrl(img.url || img.media_id)} alt={img.caption || `Изображение ${i + 1}`}
            data-testid={`task-image-${i}`} className="w-full object-contain max-h-72 bg-[#FAF8F3]" />
          {img.caption && <figcaption className="text-xs text-[#8A94A6] px-3 py-2">{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

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

// Brand mark — open book with gold "wings" and a gold sparkle star.
// Distinct from Wizard/Фили (which is strictly the AI-tutor avatar).
export function LogoMark({ size = 36, className = "", variant = "navy" }) {
  const book = variant === "light" ? "#F8F5EE" : "#1E2A4A";
  const gold = "#C9A227";
  const goldSoft = "#E7D5A2";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      className={className} data-testid="logo-mark" aria-hidden="true">
      {/* sparkle star */}
      <path d="M24 2.5c.7 3.9 1.9 5.1 5.8 5.8-3.9.7-5.1 1.9-5.8 5.8-.7-3.9-1.9-5.1-5.8-5.8 3.9-.7 5.1-1.9 5.8-5.8z"
        fill={gold} />
      <circle cx="34.5" cy="5.5" r="1.1" fill={goldSoft} />
      <circle cx="14" cy="7" r="0.9" fill={goldSoft} />
      {/* wings */}
      <path d="M24 40c-4-7-10.5-10.5-19-11 6.5-3.5 13-2.5 19 3.5" stroke={gold} strokeWidth="2.4"
        strokeLinecap="round" fill="none" />
      <path d="M24 40c4-7 10.5-10.5 19-11-6.5-3.5-13-2.5-19 3.5" stroke={gold} strokeWidth="2.4"
        strokeLinecap="round" fill="none" />
      {/* open book */}
      <path d="M24 20.5c-3.4-2.2-7.4-2.6-11-1.4v17c3.6-1.2 7.6-.8 11 1.4 3.4-2.2 7.4-2.6 11-1.4v-17c-3.6-1.2-7.6-.8-11 1.4z"
        fill={book} />
      <path d="M24 20.5v17" stroke={gold} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ withText = true, className = "", variant = "navy", size = 34 }) {
  const textColor = variant === "light" ? "text-[#F8F5EE]" : "text-[#1E2A4A]";
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="brand-logo">
      <LogoMark size={size} variant={variant} />
      {withText && (
        <span className={`font-serif font-bold text-xl tracking-tight ${textColor}`}>
          Light<span style={{ color: "#C9A227" }}>Study</span>
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
      <Loader2 className="w-7 h-7 animate-spin text-[#B0862A]" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, testId }) {
  return (
    <div className="ls-card p-10 flex flex-col items-center text-center gap-3" data-testid={testId || "empty-state"}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-[#F0EBE1] flex items-center justify-center">
          <Icon className="w-7 h-7 text-[#B0862A]" />
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-[#1E2A4A]">{title}</h3>
      {description && <p className="text-[#4B5563] max-w-md">{description}</p>}
      {action}
    </div>
  );
}

export function DonutRing({ value = 0, size = 130, stroke = 12, color = "#B0862A", label, sub }) {
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
  ege: { label: "ЕГЭ", color: "#B0862A", bg: "#F6EFDA" },
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
