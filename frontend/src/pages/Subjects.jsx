import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { api } from "@/api/client";
import { Loader, masteryColor, DonutRing } from "@/components/common";

function SubjectIcon({ name, color }) {
  const map = { sigma: Icons.Sigma, "pen-line": Icons.PenLine, atom: Icons.Atom, binary: Icons.Binary, users: Icons.Users, leaf: Icons.Leaf };
  const Icon = map[name] || Icons.BookOpen;
  return (
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}18` }}>
      <Icon className="w-6 h-6" style={{ color }} />
    </div>
  );
}

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.subjects().then(({ data }) => setSubjects(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader full />;

  const mine = subjects.filter((s) => s.selected);
  const list = mine.length ? mine : subjects;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Предметы</h1>
      <p className="text-[#4B5563] mt-1 mb-6">Выбери предмет, чтобы изучать темы, проходить уроки и практику.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((s) => (
          <div key={s.id} className="ls-card p-6 hover:shadow-lg transition-shadow" data-testid={`subject-card-${s.id}`}>
            <div className="flex items-start justify-between">
              <SubjectIcon name={s.icon} color={s.color} />
              <DonutRing value={s.mastery} size={64} stroke={7} color={s.color} label={`${s.mastery}%`} />
            </div>
            <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mt-4">{s.name}</h3>
            <div className="text-sm text-[#8A94A6] mt-1">Решено заданий: {s.completed_tasks} · Тем: {s.topic_count}</div>
            {s.next_topic && (
              <div className="mt-3 text-sm text-[#4B5563]">Далее: <span className="font-medium text-[#1E2A4A]">{s.next_topic}</span></div>
            )}
            <div className="flex gap-2 mt-5">
              <Link to={`/app/subjects/${s.id}`} className="btn-primary text-sm flex-1 text-center">Открыть</Link>
              <button onClick={() => navigate(`/app/diagnostic/${s.id}`)} data-testid={`diagnostic-btn-${s.id}`}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[#B0862A]/30 text-[#B0862A] hover:bg-[#F6EFDA]">
                Диагностика
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
