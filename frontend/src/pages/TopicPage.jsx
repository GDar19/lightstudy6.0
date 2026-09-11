import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronRight, BookOpen, Dumbbell, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "@/api/client";
import { Loader, masteryColor, DifficultyBadge } from "@/components/common";

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };

export default function TopicPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.topic(id).then(({ data }) => setTopic(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loader full />;
  if (!topic) return null;
  const TrendIcon = trendIcon[topic.trend] || Minus;

  return (
    <div className="animate-fade-up max-w-4xl">
      <nav className="flex items-center gap-1.5 text-sm text-[#8A94A6] mb-4">
        <Link to={`/app/subjects/${topic.subject_id}`} className="hover:text-[#1E2A4A]">{topic.subject_name}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[#8A94A6]">{topic.section_name}</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[#1E2A4A] font-medium">{topic.name}</span>
      </nav>

      <div className="ls-card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A]">{topic.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-[#8A94A6]">
              <span className="inline-flex items-center gap-1"><TrendIcon className="w-4 h-4" /> тренд</span>
              <span>·</span>
              <DifficultyBadge level={topic.difficulty} />
              <span>·</span>
              <span>{topic.attempts} попыток</span>
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-3xl font-extrabold" style={{ color: masteryColor(topic.mastery) }}>{topic.mastery}%</div>
            <div className="text-xs text-[#8A94A6]">освоено</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          {topic.question_count > 0 && (
            <button onClick={() => navigate(`/app/practice?subject=${topic.subject_id}&topic=${id}`)}
              data-testid="topic-practice-btn" className="btn-primary inline-flex items-center gap-2">
              <Dumbbell className="w-4 h-4" /> Практика ({topic.question_count})
            </button>
          )}
        </div>
      </div>

      {topic.lessons.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Уроки</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {topic.lessons.map((l) => (
              <Link key={l.id} to={`/app/lessons/${l.id}`} data-testid={`lesson-link-${l.id}`} className="ls-card p-5 hover:shadow-lg transition-shadow flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#EEEAFB] flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-[#7C66DC]" />
                </div>
                <div>
                  <div className="font-medium text-[#1E2A4A]">{l.title}</div>
                  <div className="text-xs text-[#8A94A6] mt-0.5">{l.duration} мин</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {topic.recent_mistakes.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Прошлые ошибки</h2>
          <div className="space-y-3">
            {topic.recent_mistakes.map((m) => (
              <div key={m.id} className="ls-card p-4">
                <div className="text-sm font-medium text-[#1E2A4A]">{m.question}</div>
                <div className="text-xs text-[#10B981] mt-1">Правильно: {m.options[m.correct_answer]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
