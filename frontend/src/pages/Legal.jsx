import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/common";

const CONTENT = {
  privacy: {
    title: "Политика конфиденциальности",
    sections: [
      ["Общие положения", "LightStudy бережно относится к данным пользователей. Мы собираем только необходимую для обучения информацию: имя, email, выбранные предметы и результаты обучения."],
      ["Использование данных", "Данные используются для формирования персонального плана, диагностики и статистики. Мы не передаём персональные данные третьим лицам без вашего согласия."],
      ["Хранение", "Данные хранятся в защищённой базе данных. Пароли хранятся только в зашифрованном виде."],
      ["Ваши права", "Вы можете изменить или удалить свои данные в настройках профиля."],
    ],
  },
  terms: {
    title: "Условия использования",
    sections: [
      ["Принятие условий", "Используя LightStudy, вы соглашаетесь с настоящими условиями. Платформа предназначена для подготовки к ЕГЭ."],
      ["Учебные материалы", "Материалы и сгенерированные задания носят тренировочный характер и не являются официальными вопросами ЕГЭ. Сверяйтесь с официальной спецификацией экзамена."],
      ["ИИ-репетитор", "Ответы ИИ-репетитора помогают в обучении, но могут содержать неточности. Проверяйте важную информацию по официальным источникам."],
      ["Ответственность", "Платформа предоставляется «как есть» для образовательных целей."],
    ],
  },
};

export default function Legal({ type = "privacy" }) {
  const c = CONTENT[type];
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
        <h1 className="font-display text-3xl font-extrabold text-[#1E2A4A]">{c.title}</h1>
        <div className="space-y-6 mt-8">
          {c.sections.map(([h, t], i) => (
            <div key={i} className="ls-card p-6">
              <h2 className="font-display text-lg font-semibold text-[#1E2A4A]">{h}</h2>
              <p className="text-[#4B5563] mt-2 leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
