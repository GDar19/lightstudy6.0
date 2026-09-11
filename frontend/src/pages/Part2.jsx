import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PenLine, Upload, X, CheckCircle2, AlertTriangle, MinusCircle, Sparkles, ArrowLeft, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, mediaUrl } from "@/api/client";
import { Loader, DifficultyBadge, Wizard } from "@/components/common";
import AIAnswer from "@/components/AIAnswer";

const STATUS_META = {
  satisfied: ["Выполнен", "#10B981", "#ECFDF5", CheckCircle2],
  partial: ["Частично", "#F59E0B", "#FEF3C7", MinusCircle],
  not: ["Не выполнен", "#EF4444", "#FEE2E2", AlertTriangle],
};

function AnalysisView({ analysis }) {
  if (!analysis) return null;
  if (analysis.raw && (!analysis.criteria || analysis.criteria.length === 0)) {
    return (
      <div className="ls-card p-5" data-testid="solution-analysis">
        <div className="flex items-center gap-2 mb-2"><Wizard size={28} /><span className="font-display font-semibold text-[#1E2A4A]">Разбор Фили</span></div>
        <AIAnswer text={analysis.feedback || analysis.raw} />
      </div>
    );
  }
  const total = analysis.total_score, max = analysis.max_score;
  return (
    <div className="ls-card p-5 space-y-4" data-testid="solution-analysis">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Wizard size={28} /><span className="font-display font-semibold text-[#1E2A4A]">Оценка Фили (ИИ, тренировочная)</span></div>
        {total != null && (
          <div className="text-right" data-testid="analysis-score">
            <div className="font-display text-2xl font-extrabold text-[#B0862A]">{total}{max != null ? ` / ${max}` : ""}</div>
            <div className="text-xs text-[#8A94A6]">баллов</div>
          </div>
        )}
      </div>

      {(analysis.criteria || []).length > 0 && (
        <div className="space-y-2">
          {analysis.criteria.map((c, i) => {
            const m = STATUS_META[c.status] || STATUS_META.partial;
            const Icon = m[3];
            return (
              <div key={i} className="p-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid={`analysis-criterion-${i}`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: m[1] }} />
                  <span className="font-medium text-[#1E2A4A] text-sm flex-1">{c.title}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: m[1], background: m[2] }}>{m[0]}</span>
                  {c.points != null && <span className="text-xs text-[#8A94A6]">{c.points}/{c.max ?? "?"} б.</span>}
                </div>
                {c.comment && <p className="text-sm text-[#4B5563] mt-1.5">{c.comment}</p>}
              </div>
            );
          })}
        </div>
      )}

      {analysis.first_error && (
        <div className="p-3 rounded-xl bg-[#FEF3C7]"><span className="font-medium text-[#1E2A4A]">Первая ошибка: </span><span className="text-sm text-[#4B5563]">{analysis.first_error}</span></div>
      )}
      {(analysis.correct_parts || []).length > 0 && (
        <div><div className="text-sm font-medium text-[#10B981] mb-1">Что сделано верно:</div><ul className="list-disc pl-5 text-sm text-[#4B5563] space-y-0.5">{analysis.correct_parts.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
      )}
      {(analysis.missing_parts || []).length > 0 && (
        <div><div className="text-sm font-medium text-[#EF4444] mb-1">Чего не хватает:</div><ul className="list-disc pl-5 text-sm text-[#4B5563] space-y-0.5">{analysis.missing_parts.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
      )}
      {analysis.feedback && <div className="p-3 rounded-xl bg-[#F6EFDA]"><AIAnswer text={analysis.feedback} /></div>}
    </div>
  );
}

function TaskDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = () => api.part2Task(id).then(({ data }) => setData(data)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (loading) return <Loader full />;
  if (!data) return null;
  const task = data.task;

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    setFiles((f) => [...f, ...arr].slice(0, 5));
  };

  const submit = async () => {
    if (files.length === 0 && !typed.trim()) { toast.error("Загрузите фото решения или введите ответ"); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("typed_answer", typed);
      files.forEach((f) => fd.append("files", f));
      const { data: res } = await api.submitSolution(id, fd);
      setResult(res.analysis);
      if (!res.available) toast.message("ИИ-оценка временно недоступна — решение сохранено");
      else toast.success("Решение проверено");
      setFiles([]); setTyped("");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-3xl animate-fade-up">
      <button onClick={onBack} data-testid="part2-back" className="inline-flex items-center gap-1.5 text-sm text-[#8A94A6] hover:text-[#1E2A4A] mb-4"><ArrowLeft className="w-4 h-4" /> Ко всем заданиям</button>

      <div className="ls-card p-6 mb-5" data-testid="part2-task">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <DifficultyBadge level={task.difficulty} />
          {task.ege_task_number && <span className="text-xs font-medium bg-[#F0EBE1] px-2 py-0.5 rounded-full text-[#1E2A4A]">№{task.ege_task_number}</span>}
          {task.exam_part && <span className="text-xs font-medium text-[#B0862A] bg-[#F6EFDA] px-2 py-0.5 rounded-full">{task.exam_part}</span>}
          <span className="text-xs text-[#8A94A6]">Развёрнутый ответ (часть 2)</span>
        </div>
        <div className="font-display text-lg font-semibold text-[#1E2A4A] whitespace-pre-line leading-relaxed">{task.question}</div>
        {(task.images || []).length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {task.images.map((img, i) => (
              <figure key={i} className="rounded-xl overflow-hidden border border-[#E5DEC9] bg-white">
                <img src={mediaUrl(img.url || img.media_id)} alt={img.caption || ""} className="w-full object-contain max-h-72 bg-[#FAF8F3]" data-testid={`part2-task-image-${i}`} />
                {img.caption && <figcaption className="text-xs text-[#8A94A6] px-3 py-2">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        {task.scoring?.criteria?.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
            <div className="text-sm font-medium text-[#1E2A4A] mb-1">Критерии оценивания ({task.scoring.max_score} б.):</div>
            <ul className="text-sm text-[#4B5563] space-y-1">
              {task.scoring.criteria.map((c, i) => <li key={i}>• <span className="font-medium">{c.title}</span> ({c.max} б.) — {c.description}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Submission */}
      <div className="ls-card p-6 mb-5">
        <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Ваше решение</h3>
        <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={3} data-testid="part2-typed-answer"
          placeholder="Можешь набрать ответ текстом (необязательно, если загружаешь фото)…"
          className="w-full px-4 py-3 rounded-xl border-2 border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A] mb-3" />

        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F6EFDA] text-[#B0862A] font-medium cursor-pointer hover:bg-[#E3DCF7] text-sm" data-testid="part2-upload-label">
          <Upload className="w-4 h-4" /> Загрузить решение
          <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" data-testid="part2-file-input"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <p className="text-xs text-[#8A94A6] mt-2">Сфотографируй рукописное решение из тетради. JPG, PNG, WEBP, HEIC. До 5 фото.</p>

        {files.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3" data-testid="part2-file-previews">
            {files.map((f, i) => (
              <div key={i} className="relative border border-[#E5DEC9] rounded-xl overflow-hidden bg-[#FAF8F3]">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-24 object-cover" />
                <button onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))} data-testid={`part2-file-remove-${i}`}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <button onClick={submit} disabled={submitting} data-testid="part2-submit"
          className="btn-accent w-full mt-4 inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> {submitting ? "Фили проверяет решение…" : "Проверить решение"}
        </button>
      </div>

      {result && <div className="mb-5"><AnalysisView analysis={result} /></div>}

      {/* Previous submissions */}
      {(data.submissions || []).length > 0 && (
        <div>
          <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Прошлые попытки ({data.submissions.length})</h3>
          <div className="space-y-4">
            {data.submissions.map((s) => (
              <div key={s.id} className="ls-card p-4" data-testid={`part2-submission-${s.id}`}>
                <div className="flex items-center gap-2 text-xs text-[#8A94A6] mb-2">
                  <span>{new Date(s.created_at).toLocaleString("ru-RU")}</span>
                  {(s.images || []).length > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> {s.images.length}</span>}
                  {s.analysis?.total_score != null && <span className="ml-auto font-semibold text-[#B0862A]">{s.analysis.total_score}/{s.analysis.max_score} б.</span>}
                </div>
                {(s.images || []).length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {s.images.map((img, i) => <img key={i} src={mediaUrl(img.url || img.media_id)} alt="" className="w-16 h-16 object-cover rounded-lg border border-[#E5DEC9]" />)}
                  </div>
                )}
                {s.analysis && <AnalysisView analysis={s.analysis} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskList({ onOpen }) {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.subjects().then(({ data }) => { const mine = data.filter((s) => s.selected); setSubjects(mine.length ? mine : data); });
  }, []);
  useEffect(() => {
    setLoading(true);
    api.part2Tasks(subject ? { subject_id: subject } : {}).then(({ data }) => setTasks(data)).catch(() => {}).finally(() => setLoading(false));
  }, [subject]);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-2 mb-2"><PenLine className="w-6 h-6 text-[#B0862A]" /><h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1E2A4A]">Часть 2 — развёрнутые ответы</h1></div>
      <p className="text-sm text-[#8A94A6] mb-6">Реши задание, сфотографируй решение из тетради и загрузи — Фили разберёт его по критериям ЕГЭ.</p>

      <select value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="part2-subject-select"
        className="mb-6 w-full max-w-xs px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] outline-none focus:border-[#B0862A]">
        <option value="">Все предметы</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {loading ? <Loader /> : tasks.length === 0 ? (
        <div className="ls-card p-8 text-center text-[#8A94A6]" data-testid="part2-empty">Пока нет заданий части 2 по выбранному предмету. Администратор может добавить их в админ-панели.</div>
      ) : (
        <div className="space-y-3" data-testid="part2-list">
          {tasks.map((t) => (
            <button key={t.id} onClick={() => onOpen(t.id)} data-testid={`part2-task-${t.id}`}
              className="w-full text-left ls-card p-5 hover:border-[#E7D5A2] transition-all">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <DifficultyBadge level={t.difficulty} />
                {t.ege_task_number && <span className="text-xs bg-[#F0EBE1] px-2 py-0.5 rounded-full text-[#1E2A4A]">№{t.ege_task_number}</span>}
                {(t.images || []).length > 0 && <span className="text-xs inline-flex items-center gap-1 text-[#8A94A6]"><ImageIcon className="w-3.5 h-3.5" /> {t.images.length}</span>}
                {t.scoring?.max_score > 0 && <span className="text-xs text-[#8A94A6]">до {t.scoring.max_score} б.</span>}
              </div>
              <div className="text-[#1E2A4A] font-medium line-clamp-2">{t.question}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Part2() {
  const { id } = useParams();
  const navigate = useNavigate();
  if (id) return <TaskDetail id={id} onBack={() => navigate("/app/part2")} />;
  return <TaskList onOpen={(tid) => navigate(`/app/part2/${tid}`)} />;
}
