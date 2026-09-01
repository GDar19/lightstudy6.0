import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/client";
import { Loader } from "@/components/common";
import QuestionRunner from "@/components/QuestionRunner";

export default function Diagnostic() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    api.startDiagnostic(subjectId)
      .then(({ data }) => setDiag(data))
      .catch((e) => toast.error(e.response?.data?.detail || "Ошибка запуска диагностики"))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const onAnswer = async (q, i) => {
    const { data } = await api.answerDiagnostic(diag.diagnostic_id, { question_id: q.id, answer: i });
    return data;
  };

  const onFinish = async () => {
    setFinishing(true);
    try {
      await api.finishDiagnostic(diag.diagnostic_id);
      navigate(`/app/diagnostic-results/${diag.diagnostic_id}`);
    } catch (e) {
      toast.error("Не удалось завершить диагностику");
      setFinishing(false);
    }
  };

  if (loading) return <Loader full label="Загружаем диагностику…" />;
  if (finishing) return <Loader full label="Анализируем результаты…" />;
  if (!diag) return null;

  return (
    <div className="py-4">
      <QuestionRunner
        questions={diag.questions}
        onAnswer={onAnswer}
        onFinish={onFinish}
        title="Диагностический тест"
        subtitle={diag.subject_name}
      />
    </div>
  );
}
