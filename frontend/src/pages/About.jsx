import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo, Wizard } from "@/components/common";

export default function About() {
  return (
    <div className="min-h-screen bg-[#F8F5EE]">
      <header className="border-b border-[#E5DEC9]">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo />
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#4B5563] hover:text-[#1E2A4A]">
            <ArrowLeft className="w-4 h-4" /> На главную
          </Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-5 py-14">
        <Wizard size={80} className="mb-6" />
        <h1 className="font-display text-4xl font-extrabold text-[#1E2A4A]">О платформе LightStudy</h1>
        <p className="text-lg text-[#4B5563] mt-4 leading-relaxed">
          LightStudy — это платформа для подготовки к ЕГЭ с индивидуальным подходом. Мы объединяем диагностику знаний,
          персональный план обучения, адаптивную практику и ИИ-репетитора в одном месте.
        </p>
        <div className="ls-card p-7 mt-8 space-y-5">
          <h2 className="font-display text-xl font-semibold text-[#1E2A4A]">Как устроено обучение</h2>
          <ol className="space-y-3 text-[#4B5563]">
            {[
              "Ты выбираешь предметы, которые планируешь сдавать.",
              "Проходишь диагностику — мы определяем уровень и слабые темы.",
              "Получаешь персональный план подготовки.",
              "Учишься через уроки и решаешь адаптивные задания.",
              "Система анализирует результаты и подстраивает сложность.",
              "ИИ-репетитор Фили помогает с любой темой в любой момент.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-lg bg-[#EEEAFB] text-[#7C66DC] text-sm font-bold flex items-center justify-center">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-8">
          <Link to="/register" className="btn-accent inline-flex">Начать бесплатно</Link>
        </div>
      </div>
    </div>
  );
}
