import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Compass, CalendarDays, Sparkles, Target, ClipboardCheck, LineChart,
  ArrowRight, Check,
} from "lucide-react";
import { Logo, Wizard } from "@/components/common";

const FEATURES = [
  { icon: Compass, title: "Диагностика уровня", text: "Определим твой текущий уровень по каждому предмету и найдём слабые темы." },
  { icon: CalendarDays, title: "Персональный план", text: "Индивидуальный план подготовки под твою цель и дату экзамена." },
  { icon: Sparkles, title: "ИИ-репетитор", text: "Фили объяснит любую тему, разберёт ошибку и подскажет решение." },
  { icon: Target, title: "Адаптивные задания", text: "Сложность подстраивается под твои результаты автоматически." },
  { icon: ClipboardCheck, title: "Пробники ЕГЭ", text: "Тренировочные пробные экзамены с таймером и разбором." },
  { icon: LineChart, title: "Анализ прогресса", text: "Наглядная статистика роста по темам и предметам." },
];

const STEPS = [
  { n: "1", title: "Выбираешь предметы", text: "Отмечаешь, что сдаёшь на ЕГЭ." },
  { n: "2", title: "Проходишь диагностику", text: "Отвечаешь на вопросы — мы оцениваем уровень." },
  { n: "3", title: "Получаешь персональный план", text: "Составляем индивидуальную программу." },
  { n: "4", title: "Учишься и решаешь задания", text: "Уроки, практика и разбор ошибок." },
  { n: "5", title: "Система адаптируется под тебя", text: "План меняется вместе с твоими результатами." },
];

function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-[#F8F5EE]/80 backdrop-blur border-b border-[#E5DEC9]">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4B5563]">
          <a href="#features" className="hover:text-[#1E2A4A]">Возможности</a>
          <a href="#how" className="hover:text-[#1E2A4A]">Как это работает</a>
          <Link to="/about" className="hover:text-[#1E2A4A]">О платформе</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" data-testid="nav-login-btn" className="px-4 py-2 text-sm font-semibold text-[#1E2A4A] hover:bg-[#F0EBE1] rounded-xl">Войти</Link>
          <Link to="/register" data-testid="nav-register-btn" className="btn-accent text-sm">Регистрация</Link>
        </div>
      </div>
    </header>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#F8F5EE]">
      <Nav />

      {/* Hero */}
      <section className="ls-gradient-hero">
        <div className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 border border-[#E5DEC9] text-xs font-semibold text-[#7C66DC] mb-6">
              <Sparkles className="w-3.5 h-3.5" /> Умная подготовка к ЕГЭ
            </span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#1E2A4A] leading-[1.1]">
              Подготовка к ЕГЭ<br />с умным подходом
            </h1>
            <p className="mt-5 text-lg text-[#4B5563] max-w-md leading-relaxed">
              Индивидуальный план, объяснение тем и постоянная поддержка ИИ-репетитора на пути к результату.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-cta-primary" className="btn-accent inline-flex items-center gap-2">
                Начать бесплатно <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#how" data-testid="hero-cta-secondary" className="inline-flex items-center px-6 py-3 rounded-xl font-semibold border border-[#1E2A4A]/15 text-[#1E2A4A] hover:bg-white/60 transition-colors">
                Как это работает
              </a>
            </div>
            <div className="mt-8 flex items-center gap-5 text-sm text-[#8A94A6]">
              {["Диагностика", "Персональный план", "ИИ-репетитор"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-[#10B981]" /> {t}</span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="flex justify-center">
            <div className="relative">
              <div className="absolute -inset-8 bg-gradient-to-tr from-[#9B8DF3]/25 to-[#C5BCFA]/10 rounded-full blur-2xl" />
              <div className="relative ls-card p-8 flex flex-col items-center gap-4 max-w-xs">
                <Wizard size={140} float />
                <div className="text-center">
                  <div className="font-display font-bold text-lg text-[#1E2A4A]">Привет, я Фили!</div>
                  <p className="text-sm text-[#4B5563] mt-1">Твой ИИ-репетитор. Помогу разобраться с любой темой и подготовиться к ЕГЭ.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-16">
        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1E2A4A] text-center">Всё для подготовки в одном месте</h2>
        <p className="text-center text-[#4B5563] mt-3 max-w-xl mx-auto">Платформа ведёт тебя от диагностики до результата.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="ls-card p-6">
              <div className="w-12 h-12 rounded-2xl bg-[#EEEAFB] flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6 text-[#7C66DC]" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">{f.title}</h3>
              <p className="text-[#4B5563] mt-2 text-sm leading-relaxed">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-[#182238] py-16">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white text-center">Как это работает</h2>
          <div className="grid md:grid-cols-5 gap-4 mt-10">
            {STEPS.map((s, i) => (
              <motion.div key={s.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="bg-white/5 rounded-2xl p-5 border border-white/10">
                <div className="w-9 h-9 rounded-xl bg-[#7C66DC] text-white font-display font-bold flex items-center justify-center">{s.n}</div>
                <h3 className="font-display font-semibold text-white mt-4">{s.title}</h3>
                <p className="text-[#B8C0D0] text-sm mt-1.5">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <div className="ls-card p-10 sm:p-14 text-center ls-gradient-hero">
          <Wizard size={72} className="mx-auto mb-5" />
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#1E2A4A]">Готов начать подготовку?</h2>
          <p className="text-[#4B5563] mt-3 max-w-md mx-auto">Создай аккаунт, пройди диагностику и получи персональный план уже сегодня.</p>
          <Link to="/register" data-testid="cta-register-btn" className="btn-accent inline-flex items-center gap-2 mt-7">
            Начать бесплатно <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#E5DEC9]">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-6 text-sm text-[#8A94A6]">
            <Link to="/about" className="hover:text-[#1E2A4A]">О платформе</Link>
            <Link to="/privacy" className="hover:text-[#1E2A4A]">Конфиденциальность</Link>
            <Link to="/terms" className="hover:text-[#1E2A4A]">Условия</Link>
          </div>
          <span className="text-xs text-[#8A94A6]">© 2026 LightStudy</span>
        </div>
      </footer>
    </div>
  );
}
