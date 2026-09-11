import React, { useEffect, useState } from "react";
import { Plus, ChevronUp, ChevronDown, Power, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/api/client";

export default function AdminCurriculum({ subjects }) {
  const [subject, setSubject] = useState(subjects[0]?.id || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);

  const load = () => {
    if (!subject) return;
    setLoading(true);
    api.adminCurriculum(subject).then(({ data }) => setRows(data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [subject]); // eslint-disable-line

  const save = async (r, patch) => {
    try { await api.updateCurriculum(r.id, patch); setRows((l) => l.map((x) => x.id === r.id ? { ...x, ...patch } : x)); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const move = async (r, dir) => {
    const patch = { order: (r.order || 0) + dir };
    await save(r, patch);
    load();
  };
  const del = async (r) => { await api.deleteCurriculum(r.id); toast.success("Тема выключена"); load(); };

  const create = async () => {
    if (!creating?.topic_id || !creating?.title) { toast.error("Укажите topic_id и название"); return; }
    try {
      await api.createCurriculum({ ...creating, subject_id: subject, order: rows.length + 1 });
      toast.success("Тема добавлена"); setCreating(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="admin-curriculum">
      <div className="flex items-center gap-2 mb-4">
        <select value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="curriculum-subject-select"
          className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] text-sm">
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={() => setCreating({ topic_id: "", subtopic_id: "", title: "", description: "", ege_task_numbers: [] })}
          data-testid="curriculum-add-btn" className="btn-accent inline-flex items-center gap-2 text-sm ml-auto">
          <Plus className="w-4 h-4" /> Добавить тему
        </button>
      </div>

      {creating && (
        <div className="ls-card p-4 mb-4 grid sm:grid-cols-2 gap-2" data-testid="curriculum-create-form">
          <input placeholder="topic_id (например logarithms)" value={creating.topic_id} onChange={(e) => setCreating((c) => ({ ...c, topic_id: e.target.value }))} className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="curriculum-new-topicid" />
          <input placeholder="Название темы" value={creating.title} onChange={(e) => setCreating((c) => ({ ...c, title: e.target.value }))} className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="curriculum-new-title" />
          <input placeholder="Подтема (необязательно)" value={creating.subtopic_id} onChange={(e) => setCreating((c) => ({ ...c, subtopic_id: e.target.value }))} className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
          <input placeholder="№ ЕГЭ через запятую" onChange={(e) => setCreating((c) => ({ ...c, ege_task_numbers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} className="px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" />
          <textarea placeholder="Описание" value={creating.description} onChange={(e) => setCreating((c) => ({ ...c, description: e.target.value }))} className="sm:col-span-2 px-3 py-2 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" rows={2} />
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={create} data-testid="curriculum-save-new" className="btn-primary">Сохранить</button>
            <button onClick={() => setCreating(null)} className="px-4 py-2 rounded-xl border border-[#E5DEC9]">Отмена</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className={`ls-card p-3 flex items-center gap-3 ${r.is_active ? "" : "opacity-50"}`} data-testid={`curriculum-row-${r.topic_id}`}>
            <div className="flex flex-col">
              <button onClick={() => move(r, -1)} className="p-0.5 text-[#7C66DC] hover:bg-[#EEEAFB] rounded"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => move(r, 1)} className="p-0.5 text-[#7C66DC] hover:bg-[#EEEAFB] rounded"><ChevronDown className="w-4 h-4" /></button>
            </div>
            <span className="w-8 text-center text-sm font-semibold text-[#8A94A6]">{r.order}</span>
            <input defaultValue={r.title} onBlur={(e) => e.target.value !== r.title && save(r, { title: e.target.value })}
              className="flex-1 px-2 py-1.5 rounded-lg border border-transparent hover:border-[#E5DEC9] bg-transparent font-medium text-[#1E2A4A]" data-testid={`curriculum-title-${r.topic_id}`} />
            <span className="text-xs text-[#8A94A6]">{r.topic_id}{r.subtopic_id ? ` / ${r.subtopic_id}` : ""}</span>
            <button onClick={() => save(r, { is_active: !r.is_active })} title="Вкл/выкл" data-testid={`curriculum-toggle-${r.topic_id}`}
              className={`p-1.5 rounded-lg ${r.is_active ? "text-[#10B981]" : "text-[#8A94A6]"} hover:bg-[#F0EBE1]`}><Power className="w-4 h-4" /></button>
            <button onClick={() => del(r)} className="p-1.5 rounded-lg text-[#EF4444] hover:bg-[#FEE2E2]"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {!loading && rows.length === 0 && <div className="ls-card p-8 text-center text-[#8A94A6]">Нет тем в программе</div>}
      </div>
    </div>
  );
}
