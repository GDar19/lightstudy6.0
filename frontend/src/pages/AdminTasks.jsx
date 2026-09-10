import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Eye, CheckCircle2, Circle, ImageIcon, X, Upload, Bot, Copy, Archive, Send, Search } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, mediaUrl } from "@/api/client";
import { DifficultyBadge } from "@/components/common";

export const TYPE_LABELS = {
  single_choice: "Один вариант", multiple_choice: "Несколько вариантов", true_false: "Верно/Неверно",
  numeric: "Числовой ответ", text: "Текстовый ответ", matching: "Соответствие",
  ordering: "Последовательность", table_completion: "Заполнение таблицы",
  graph_analysis: "Анализ графика", diagram_analysis: "Анализ схемы",
  image_analysis: "Анализ изображения", extended_response: "Развёрнутый ответ (часть 2)",
};
const STATUS_LABELS = {
  draft: ["Черновик", "#8A94A6", "#F0EBE1"],
  verification: ["На проверке", "#F59E0B", "#FEF3C7"],
  published: ["Опубликовано", "#10B981", "#ECFDF5"],
  archived: ["В архиве", "#EF4444", "#FEE2E2"],
};
const CHOICE_FORMATS = ["single_choice", "multiple_choice", "true_false", "numeric", "text"];
const ANALYSIS = ["graph_analysis", "diagram_analysis", "image_analysis"];

const EMPTY = {
  subject_id: "", topic_id: "", subtopic: "", difficulty: "medium", type: "single_choice",
  question: "", options: ["", "", "", ""], answer: 0, answer_value: "",
  explanation: "", solution: "", hint: "", exam_part: "", ege_task_number: "", ege_category: "",
  source: "", status: "draft", images: [], answer_format: "single_choice",
  match_left: [], match_right: [], match_answer: [],
  order_items: [], order_answer: [],
  table_headers: [], table_rows: [], table_answer: [],
  scoring: { max_score: 2, criteria: [] },
  verified: false, ai_generated: false,
};

const linesToArr = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a) => (a || []).join("\n");

export default function AdminTasks({ subjects, topics }) {
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ subject_id: "", topic_id: "", qtype: "", status: "", ai_generated: "", has_images: "", search: "", sort: "recent" });
  const [editing, setEditing] = useState(null); // form object or null
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const loadStats = () => api.questionStats().then(({ data }) => setStats(data)).catch(() => {});
  const load = () => {
    setLoading(true);
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v !== "" && k !== "sort") params[k] = v; });
    params.sort = filters.sort;
    api.adminQuestions(params).then(({ data }) => setQuestions(data)).catch(() => {}).finally(() => setLoading(false));
    loadStats();
  };
  useEffect(load, [filters]); // eslint-disable-line

  const subjTopics = useMemo(() => (sid) => topics.filter((t) => !sid || t.subject_id === sid), [topics]);
  const subjName = (id) => subjects.find((s) => s.id === id)?.name || id;

  const del = async (id) => {
    if (!window.confirm("Удалить задание безвозвратно? (совет: используйте архив вместо удаления)")) return;
    await api.deleteQuestion(id);
    setQuestions((q) => q.filter((x) => x.id !== id));
    loadStats();
    toast.success("Задание удалено");
  };
  const changeStatus = async (q, status) => {
    try {
      const { data } = await api.setQuestionStatus(q.id, status);
      setQuestions((list) => list.map((x) => x.id === q.id ? { ...x, status: data.status, verified: data.verified } : x));
      loadStats();
      toast.success(`Статус: ${STATUS_LABELS[status][0]}`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const duplicate = async (q) => {
    try { await api.duplicateQuestion(q.id); load(); toast.success("Создана копия (черновик)"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const StatBox = ({ label, value, color }) => (
    <div className="ls-card px-4 py-3 text-center min-w-[92px]"><div className="font-display text-xl font-extrabold" style={{ color: color || "#1E2A4A" }}>{value}</div><div className="text-xs text-[#8A94A6]">{label}</div></div>
  );

  return (
    <div data-testid="admin-tasks">
      {/* Bank statistics */}
      {stats && (
        <div className="flex flex-wrap gap-3 mb-5" data-testid="task-stats">
          <StatBox label="Всего" value={stats.total} />
          <StatBox label="Опубликовано" value={stats.published} color="#10B981" />
          <StatBox label="Черновики" value={stats.draft} color="#8A94A6" />
          <StatBox label="На проверке" value={stats.verification} color="#F59E0B" />
          <StatBox label="В архиве" value={stats.archived} color="#EF4444" />
          <StatBox label="С картинками" value={stats.with_images} color="#7C66DC" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8A94A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input placeholder="Поиск по условию…" value={filters.search} data-testid="task-search"
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="pl-8 pr-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm w-56" />
        </div>
        <select value={filters.subject_id} data-testid="task-filter-subject" onChange={(e) => setFilters((f) => ({ ...f, subject_id: e.target.value, topic_id: "" }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="">Все предметы</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.topic_id} data-testid="task-filter-topic" onChange={(e) => setFilters((f) => ({ ...f, topic_id: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="">Все темы</option>
          {subjTopics(filters.subject_id).map((t) => <option key={t.topic_id} value={t.topic_id}>{t.name}</option>)}
        </select>
        <select value={filters.status} data-testid="task-filter-status" onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l[0]}</option>)}
        </select>
        <select value={filters.qtype} data-testid="task-filter-type" onChange={(e) => setFilters((f) => ({ ...f, qtype: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="">Все типы</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.has_images} data-testid="task-filter-images" onChange={(e) => setFilters((f) => ({ ...f, has_images: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="">Картинки: все</option><option value="true">С картинками</option>
        </select>
        <select value={filters.sort} data-testid="task-filter-sort" onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          <option value="recent">Сначала новые</option><option value="oldest">Сначала старые</option>
          <option value="difficulty">По сложности</option><option value="subject">По предмету</option>
        </select>
        <button onClick={() => setEditing({ ...EMPTY })} data-testid="admin-add-question-btn" className="btn-accent inline-flex items-center gap-2 text-sm ml-auto">
          <Plus className="w-4 h-4" /> Создать задание
        </button>
      </div>
      <div className="text-sm text-[#8A94A6] mb-3">Найдено: {questions.length}{loading && " · загрузка…"}</div>

      {/* List */}
      <div className="space-y-3">
        {questions.map((q) => {
          const st = STATUS_LABELS[q.status] || STATUS_LABELS.draft;
          return (
          <div key={q.id} className="ls-card p-4" data-testid={`admin-question-${q.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: st[1], background: st[2] }} data-testid={`task-status-${q.id}`}>{st[0]}</span>
                  <DifficultyBadge level={q.difficulty} />
                  <span className="text-xs font-medium text-[#7C66DC] bg-[#EEEAFB] px-2 py-0.5 rounded-full">{TYPE_LABELS[q.type] || q.type}</span>
                  {q.exam_part && <span className="text-xs bg-[#F0EBE1] px-2 py-0.5 rounded-full text-[#1E2A4A]">{q.exam_part}</span>}
                  {q.ege_task_number && <span className="text-xs bg-[#F0EBE1] px-2 py-0.5 rounded-full text-[#1E2A4A]">№{q.ege_task_number}</span>}
                  {(q.images || []).length > 0 && <span className="text-xs inline-flex items-center gap-1 text-[#8A94A6]"><ImageIcon className="w-3.5 h-3.5" /> {q.images.length}</span>}
                  {q.ai_generated && <span className="text-xs inline-flex items-center gap-1 text-[#F59E0B]"><Bot className="w-3.5 h-3.5" /> ИИ</span>}
                  {q.scoring?.criteria?.length > 0 && <span className="text-xs text-[#8A94A6]">критериев: {q.scoring.criteria.length}</span>}
                </div>
                <div className="text-[#1E2A4A] font-medium truncate">{q.question}</div>
                <div className="text-xs text-[#8A94A6] mt-1">
                  {subjName(q.subject_id)} · {q.topic_id}{q.subtopic ? ` · ${q.subtopic}` : ""}
                  {q.source ? ` · ${q.source}` : ""}
                  {q.source_doc_id && ` · источник: ${q.source_doc_title || "учебник"}, стр. ${q.source_page ?? "—"}`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {q.status !== "published" && <button onClick={() => changeStatus(q, "published")} data-testid={`task-publish-${q.id}`} className="p-2 rounded-lg text-[#10B981] hover:bg-[#ECFDF5]" title="Опубликовать"><Send className="w-4 h-4" /></button>}
                {q.status !== "archived" && <button onClick={() => changeStatus(q, "archived")} data-testid={`task-archive-${q.id}`} className="p-2 rounded-lg text-[#F59E0B] hover:bg-[#FEF3C7]" title="В архив"><Archive className="w-4 h-4" /></button>}
                <button onClick={() => setPreview(q)} data-testid={`task-preview-${q.id}`} className="p-2 rounded-lg text-[#7C66DC] hover:bg-[#EEEAFB]" title="Предпросмотр"><Eye className="w-4 h-4" /></button>
                <button onClick={() => setEditing({ ...EMPTY, ...q, scoring: q.scoring || { max_score: 2, criteria: [] } })} data-testid={`task-edit-${q.id}`} className="p-2 rounded-lg text-[#1E2A4A] hover:bg-[#F0EBE1]" title="Редактировать"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => duplicate(q)} data-testid={`task-duplicate-${q.id}`} className="p-2 rounded-lg text-[#1E2A4A] hover:bg-[#F0EBE1]" title="Дублировать"><Copy className="w-4 h-4" /></button>
                <button onClick={() => del(q.id)} data-testid={`admin-delete-${q.id}`} className="p-2 rounded-lg text-[#EF4444] hover:bg-[#FEE2E2]"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        );})}
        {!loading && questions.length === 0 && <div className="ls-card p-8 text-center text-[#8A94A6]">Заданий не найдено</div>}
      </div>

      {editing && <TaskEditor form={editing} setForm={setEditing} subjects={subjects} topics={subjTopics}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {preview && <TaskPreview q={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function TaskEditor({ form, setForm, subjects, topics, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const t = form.type;
  const isChoice = ["single_choice", "true_false", "multiple_choice"].includes(t);
  const isAnalysis = ANALYSIS.includes(t);
  const effFormat = isAnalysis ? form.answer_format : t;
  const showChoiceOpts = ["single_choice", "true_false", "multiple_choice"].includes(effFormat);
  const showValue = ["numeric", "text"].includes(effFormat);

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "task");
      const { data } = await api.adminUploadMedia(fd);
      set({ images: [...(form.images || []), { media_id: data.media_id, url: data.url, caption: "", kind: "image" }] });
      toast.success("Изображение загружено");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (t === "ordering") payload.order_answer = (form.order_items || []).map((_, i) => i);
      const res = form.id ? await api.updateQuestion(form.id, payload) : await api.createQuestion(payload);
      toast.success(form.id ? "Задание обновлено" : "Задание создано");
      onSaved(res);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4" data-testid="task-editor">
      <div className="ls-card bg-white w-full max-w-2xl p-6 space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">{form.id ? "Редактировать задание" : "Новое задание"}</h3>
          <button onClick={onClose} data-testid="task-editor-close" className="p-1.5 rounded-lg hover:bg-[#F0EBE1]"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <select value={form.subject_id} data-testid="edit-subject" onChange={(e) => set({ subject_id: e.target.value, topic_id: "" })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
            <option value="">Предмет…</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={form.topic_id} data-testid="edit-topic" onChange={(e) => set({ topic_id: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
            <option value="">Тема…</option>
            {topics(form.subject_id).map((tp) => <option key={tp.topic_id} value={tp.topic_id}>{tp.name}</option>)}
          </select>
          <select value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
            <option value="easy">Базовая</option><option value="medium">Средняя</option><option value="hard">Сложная</option><option value="ege">ЕГЭ</option>
          </select>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <select value={form.type} data-testid="edit-type" onChange={(e) => set({ type: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="№ задания ЕГЭ" value={form.ege_task_number} onChange={(e) => set({ ege_task_number: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-ege-number" />
          <input placeholder="Часть ЕГЭ" value={form.exam_part} onChange={(e) => set({ exam_part: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <input placeholder="Подтема" value={form.subtopic} onChange={(e) => set({ subtopic: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-subtopic" />
          <input placeholder="Источник (учебник, автор…)" value={form.source} onChange={(e) => set({ source: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-source" />
          <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-status">
            <option value="draft">Черновик</option>
            <option value="verification">На проверке</option>
            <option value="published">Опубликовано</option>
            <option value="archived">В архиве</option>
          </select>
        </div>

        <textarea placeholder="Текст задания" value={form.question} onChange={(e) => set({ question: e.target.value })} rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-question" />

        {/* Images */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-[#1E2A4A]">Изображения / диаграммы / графики</label>
            <label className="inline-flex items-center gap-1.5 text-sm text-[#7C66DC] cursor-pointer hover:underline" data-testid="edit-image-upload-label">
              <Upload className="w-4 h-4" /> {uploading ? "Загрузка…" : "Загрузить"}
              <input type="file" accept="image/*" className="hidden" data-testid="edit-image-input"
                onChange={(e) => { uploadImage(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          {(form.images || []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {form.images.map((img, i) => (
                <div key={i} className="border border-[#E5DEC9] rounded-xl overflow-hidden bg-[#FAF8F3]" data-testid={`edit-image-${i}`}>
                  <img src={mediaUrl(img.url || img.media_id)} alt="" className="w-full h-24 object-contain bg-white" />
                  <input placeholder="Подпись" value={img.caption || ""} onChange={(e) => { const arr = [...form.images]; arr[i] = { ...arr[i], caption: e.target.value }; set({ images: arr }); }}
                    className="w-full px-2 py-1.5 text-xs border-t border-[#E5DEC9] bg-white" />
                  <button onClick={() => set({ images: form.images.filter((_, j) => j !== i) })} data-testid={`edit-image-remove-${i}`}
                    className="w-full text-xs text-[#EF4444] py-1 hover:bg-[#FEE2E2]">Удалить</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAnalysis && (
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Формат ответа</label>
            <select value={form.answer_format} onChange={(e) => set({ answer_format: e.target.value })} data-testid="edit-answer-format" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
              {CHOICE_FORMATS.map((v) => <option key={v} value={v}>{TYPE_LABELS[v]}</option>)}
            </select>
          </div>
        )}

        {/* Choice options */}
        {showChoiceOpts && (
          <div className="space-y-2">
            <div className="text-xs text-[#8A94A6]">Отметь правильный вариант{effFormat === "multiple_choice" ? "ы" : ""} слева:</div>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                {effFormat === "multiple_choice" ? (
                  <input type="checkbox" checked={Array.isArray(form.answer) && form.answer.includes(i)} data-testid={`edit-correct-${i}`}
                    onChange={() => { const a = Array.isArray(form.answer) ? form.answer : []; set({ answer: a.includes(i) ? a.filter((x) => x !== i) : [...a, i] }); }} className="accent-[#7C66DC]" />
                ) : (
                  <input type="radio" checked={form.answer === i} onChange={() => set({ answer: i })} data-testid={`edit-correct-${i}`} className="accent-[#7C66DC]" />
                )}
                <input placeholder={`Вариант ${i + 1}`} value={o} onChange={(e) => { const opts = [...form.options]; opts[i] = e.target.value; set({ options: opts }); }}
                  className="flex-1 px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid={`edit-option-${i}`} />
                <button onClick={() => set({ options: form.options.filter((_, j) => j !== i) })} className="p-1.5 text-[#EF4444] hover:bg-[#FEE2E2] rounded"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={() => set({ options: [...form.options, ""] })} className="text-sm text-[#7C66DC] hover:underline">+ Добавить вариант</button>
          </div>
        )}

        {/* Numeric / text value */}
        {showValue && (
          <input placeholder="Правильный ответ (значение)" value={form.answer_value || ""} onChange={(e) => set({ answer_value: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-answer-value" />
        )}

        {/* Matching */}
        {t === "matching" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1E2A4A]">Левый столбец (по строке)</label>
            <textarea value={arrToLines(form.match_left)} onChange={(e) => set({ match_left: linesToArr(e.target.value) })} rows={3} data-testid="edit-match-left" className="w-full px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
            <label className="text-sm font-medium text-[#1E2A4A]">Правый столбец (по строке)</label>
            <textarea value={arrToLines(form.match_right)} onChange={(e) => set({ match_right: linesToArr(e.target.value) })} rows={3} data-testid="edit-match-right" className="w-full px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
            <label className="text-sm font-medium text-[#1E2A4A]">Правильные соответствия</label>
            {(form.match_left || []).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-[#4B5563]">{l || `(строка ${i + 1})`}</span>
                <select value={(form.match_answer || [])[i] ?? ""} data-testid={`edit-match-answer-${i}`}
                  onChange={(e) => { const a = [...(form.match_answer || [])]; a[i] = Number(e.target.value); set({ match_answer: a }); }}
                  className="px-2 py-1.5 rounded-lg border border-[#E5DEC9] bg-[#FAF8F3]">
                  <option value="">—</option>
                  {(form.match_right || []).map((r, j) => <option key={j} value={j}>{j + 1}. {r}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Ordering */}
        {t === "ordering" && (
          <div>
            <label className="text-sm font-medium text-[#1E2A4A]">Элементы в ПРАВИЛЬНОМ порядке (по строке)</label>
            <textarea value={arrToLines(form.order_items)} onChange={(e) => set({ order_items: linesToArr(e.target.value) })} rows={4} data-testid="edit-order-items" className="w-full px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
            <p className="text-xs text-[#8A94A6] mt-1">Ученику элементы покажутся в перемешанном порядке.</p>
          </div>
        )}

        {/* Table completion */}
        {t === "table_completion" && (
          <div className="space-y-2">
            <input placeholder="Заголовки через запятую" value={(form.table_headers || []).join(", ")} onChange={(e) => set({ table_headers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} data-testid="edit-table-headers" className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
            <label className="text-sm font-medium text-[#1E2A4A]">Строки (ячейки через «|», пропуск — «___»)</label>
            <textarea value={(form.table_rows || []).map((r) => r.join(" | ")).join("\n")} data-testid="edit-table-rows"
              onChange={(e) => set({ table_rows: e.target.value.split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim())) })}
              rows={4} className="w-full px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] font-mono text-sm" />
            <label className="text-sm font-medium text-[#1E2A4A]">Ответы для пропусков (по строке, по порядку)</label>
            <textarea value={arrToLines(form.table_answer)} onChange={(e) => set({ table_answer: linesToArr(e.target.value) })} rows={3} data-testid="edit-table-answer" className="w-full px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
          </div>
        )}

        {/* Extended response scoring criteria */}
        {t === "extended_response" && (
          <div className="space-y-3 p-3 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9]">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-[#1E2A4A]">Максимальный балл</label>
              <input type="number" min="1" value={form.scoring?.max_score ?? 2} data-testid="edit-max-score"
                onChange={(e) => set({ scoring: { ...form.scoring, max_score: Number(e.target.value) } })} className="w-20 px-2 py-1.5 rounded-lg border border-[#E5DEC9] bg-white" />
            </div>
            {(form.scoring?.criteria || []).map((c, i) => (
              <div key={i} className="p-3 rounded-lg bg-white border border-[#E5DEC9] space-y-2" data-testid={`edit-criterion-${i}`}>
                <div className="flex gap-2">
                  <input placeholder="Название критерия" value={c.title || ""} onChange={(e) => { const cr = [...form.scoring.criteria]; cr[i] = { ...cr[i], title: e.target.value }; set({ scoring: { ...form.scoring, criteria: cr } }); }} className="flex-1 px-2 py-1.5 rounded-lg border border-[#E5DEC9] text-sm" />
                  <input type="number" min="0" placeholder="балл" value={c.max ?? 1} onChange={(e) => { const cr = [...form.scoring.criteria]; cr[i] = { ...cr[i], max: Number(e.target.value) }; set({ scoring: { ...form.scoring, criteria: cr } }); }} className="w-16 px-2 py-1.5 rounded-lg border border-[#E5DEC9] text-sm" />
                  <button onClick={() => set({ scoring: { ...form.scoring, criteria: form.scoring.criteria.filter((_, j) => j !== i) } })} className="p-1.5 text-[#EF4444]"><X className="w-4 h-4" /></button>
                </div>
                <textarea placeholder="Описание / что требуется" value={c.description || ""} onChange={(e) => { const cr = [...form.scoring.criteria]; cr[i] = { ...cr[i], description: e.target.value }; set({ scoring: { ...form.scoring, criteria: cr } }); }} rows={2} className="w-full px-2 py-1.5 rounded-lg border border-[#E5DEC9] text-sm" />
              </div>
            ))}
            <button onClick={() => set({ scoring: { ...form.scoring, criteria: [...(form.scoring?.criteria || []), { title: "", description: "", max: 1 }] } })} data-testid="edit-add-criterion" className="text-sm text-[#7C66DC] hover:underline">+ Добавить критерий</button>
          </div>
        )}

        <textarea placeholder="Объяснение / комментарий" value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-explanation" />
        <textarea placeholder="Подробное решение (для part 2 / сложных задач)" value={form.solution} onChange={(e) => set({ solution: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="edit-solution" />
        <input placeholder="Подсказка" value={form.hint} onChange={(e) => set({ hint: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-[#1E2A4A]">
            <input type="checkbox" checked={!!form.verified} onChange={(e) => set({ verified: e.target.checked })} data-testid="edit-verified" className="accent-[#10B981]" /> Проверено
          </label>
          {form.ai_generated && <span className="text-xs inline-flex items-center gap-1 text-[#F59E0B]"><Bot className="w-3.5 h-3.5" /> сгенерировано ИИ</span>}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving || !form.subject_id || !form.topic_id || !form.question.trim()} data-testid="edit-save" className="btn-primary flex-1 disabled:opacity-50">{saving ? "Сохранение…" : "Сохранить"}</button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl border border-[#E5DEC9] text-[#1E2A4A] hover:bg-[#F0EBE1]">Отмена</button>
        </div>
      </div>
    </div>
  );
}

function TaskPreview({ q, onClose }) {
  const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];
  const correct = Array.isArray(q.answer) ? q.answer : [q.answer];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4" data-testid="task-preview" onClick={onClose}>
      <div className="ls-card bg-white w-full max-w-xl p-6 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">Предпросмотр</h3>
          <button onClick={onClose} data-testid="task-preview-close" className="p-1.5 rounded-lg hover:bg-[#F0EBE1]"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DifficultyBadge level={q.difficulty} />
          <span className="text-xs text-[#7C66DC] bg-[#EEEAFB] px-2 py-0.5 rounded-full">{TYPE_LABELS[q.type] || q.type}</span>
        </div>
        <div className="font-medium text-[#1E2A4A] whitespace-pre-line">{q.question}</div>
        {(q.images || []).map((img, i) => (
          <figure key={i} className="rounded-xl overflow-hidden border border-[#E5DEC9]">
            <img src={mediaUrl(img.url || img.media_id)} alt="" className="w-full object-contain max-h-72 bg-[#FAF8F3]" />
            {img.caption && <figcaption className="text-xs text-[#8A94A6] px-3 py-2">{img.caption}</figcaption>}
          </figure>
        ))}
        {(q.options || []).length > 0 && (
          <div className="space-y-2">
            {q.options.map((o, i) => (
              <div key={i} className={`p-3 rounded-xl border text-sm ${correct.includes(i) ? "border-[#10B981] bg-[#ECFDF5]" : "border-[#E5DEC9] bg-[#FAF8F3]"}`}>{LETTERS[i]}. {o}</div>
            ))}
          </div>
        )}
        {q.answer_value != null && q.answer_value !== "" && <div className="text-sm text-[#10B981]">Ответ: {String(q.answer_value)}</div>}
        {q.type === "matching" && (q.match_left || []).map((l, i) => (
          <div key={i} className="text-sm text-[#4B5563]">{l} → {(q.match_right || [])[(q.match_answer || [])[i]]}</div>
        ))}
        {q.type === "ordering" && <div className="text-sm text-[#4B5563]">Порядок: {(q.order_items || []).join(" → ")}</div>}
        {q.explanation && <p className="text-sm text-[#4B5563]"><span className="font-medium">Объяснение:</span> {q.explanation}</p>}
        {q.solution && <p className="text-sm text-[#4B5563] whitespace-pre-line"><span className="font-medium">Решение:</span> {q.solution}</p>}
        {q.scoring?.criteria?.length > 0 && (
          <div className="text-sm text-[#4B5563]">
            <div className="font-medium">Критерии ({q.scoring.max_score} б.):</div>
            {q.scoring.criteria.map((c, i) => <div key={i}>• {c.title} ({c.max} б.) — {c.description}</div>)}
          </div>
        )}
        {(q.ai_generated || q.source_doc_id) && (
          <div className="text-xs text-[#8A94A6] border-t border-[#E5DEC9] pt-3 space-y-1" data-testid="task-preview-source">
            {q.ai_generated && <div className="inline-flex items-center gap-1 text-[#F59E0B]"><Bot className="w-3.5 h-3.5" /> Сгенерировано ИИ · {q.verified ? "проверено" : "не проверено"}</div>}
            {q.source_doc_id && <div>Источник: {q.source_doc_title || "учебник"}{q.source_page != null ? `, стр. ${q.source_page}` : ""}</div>}
            {q.source_context && <div className="italic">Контекст: «{String(q.source_context).slice(0, 240)}…»</div>}
          </div>
        )}
      </div>
    </div>
  );
}
