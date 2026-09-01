import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronRight, BookOpen, Dumbbell, Compass } from "lucide-react";
import { api } from "@/api/client";
import { Loader, masteryColor, DifficultyBadge } from "@/components/common";

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.subject(id).then(({ data }) => setSubject(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loader full />;
  if (!subject) return null;

  return (
    <div className="animate-fade-up">
      <nav className="flex items-center gap-1.5 text-sm text-[#8A94A6] mb-4">
        <Link to="/app/subjects" className="hover:text-[#1E2A4A]">Предметы</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[#1E2A4A] font-medium">{subject.name}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">{subject.name}</h1>
          <p className="text-[#4B5563] mt-1">{subject.description}</p>
        </div>
        <button onClick={() => navigate(`/app/diagnostic/${id}`)} data-testid="subject-diagnostic-btn"
          className="btn-accent inline-flex items-center gap-2 self-start">
          <Compass className="w-4 h-4" /> Диагностика
        </button>
      </div>

      <div className="space-y-6">
        {subject.sections.map((sec) => (
          <div key={sec.id}>
            <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">{sec.name}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {sec.topics.map((t) => (
                <div key={t.id} className="ls-card p-5" data-testid={`topic-card-${t.id}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-[#1E2A4A]">{t.name}</h3>
                    <DifficultyBadge level={t.difficulty} />
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#8A94A6]">Освоено</span>
                      <span className="font-semibold" style={{ color: masteryColor(t.mastery) }}>{t.mastery}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#EDE6D6] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.mastery}%`, background: masteryColor(t.mastery) }} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Link to={`/app/topics/${t.id}`} className="flex-1 text-center text-sm font-medium py-2 rounded-xl bg-[#F0EBE1] text-[#1E2A4A] hover:bg-[#E2DACB] inline-flex items-center justify-center gap-1.5">
                      <BookOpen className="w-4 h-4" /> Тема
                    </Link>
                    {t.question_count > 0 && (
                      <button onClick={() => navigate(`/app/practice?subject=${id}&topic=${t.id}`)}
                        data-testid={`practice-topic-${t.id}`}
                        className="flex-1 text-sm font-medium py-2 rounded-xl bg-[#EEEAFB] text-[#7C66DC] hover:bg-[#E3DCF7] inline-flex items-center justify-center gap-1.5">
                        <Dumbbell className="w-4 h-4" /> Практика
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
