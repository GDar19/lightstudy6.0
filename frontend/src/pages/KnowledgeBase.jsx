import React, { useEffect, useRef, useState } from "react";
import { Upload, RefreshCw, Trash2, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/api/client";

const DOC_TYPES = [
  ["textbook", "Учебник"], ["ege_spec", "Спецификация ЕГЭ"], ["ege_demo", "Демоверсия ЕГЭ"],
  ["ege_codifier", "Кодификатор ЕГЭ"], ["methodical", "Метод. материал"], ["other", "Другое"],
];
const STATUS = {
  processing: ["Обработка…", "#F59E0B", "#FEF3C7"],
  indexed: ["Проиндексирован", "#10B981", "#ECFDF5"],
  error: ["Ошибка", "#EF4444", "#FEE2E2"],
};
const plural = (n, forms) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
};

export default function KnowledgeBase({ subjects }) {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ title: "", subject_id: "", grade: "", doc_type: "textbook" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchSubject, setSearchSubject] = useState("");
  const [results, setResults] = useState(null);
  const removedRef = useRef(new Set());

  const load = () => api.kbList().then(({ data }) => setDocs(data.filter((d) => !removedRef.current.has(d.id)))).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // poll processing status
    return () => clearInterval(t);
  }, []);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) { toast.error("Выбери PDF-файл"); return; }
    if (!form.title.trim()) { toast.error("Укажи название документа"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      await api.kbUpload(fd);
      toast.success("Файл загружен, идёт обработка…");
      setForm({ title: "", subject_id: "", grade: "", doc_type: "textbook" });
      setFile(null);
      e.target.reset();
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setUploading(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Удалить документ? Файл и все проиндексированные фрагменты будут удалены безвозвратно.")) return;
    removedRef.current.add(id);
    setDocs((d) => d.filter((x) => x.id !== id));
    try { await api.kbDelete(id); toast.success("Удалено"); }
    catch (err) { removedRef.current.delete(id); load(); toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const reprocess = async (id) => { await api.kbReprocess(id); toast.success("Переиндексация запущена"); load(); };
  const search = async () => {
    if (!query.trim()) return;
    const { data } = await api.kbSearch({ subject_id: searchSubject || null, query });
    setResults(data.results);
  };

  return (
    <div className="space-y-6" data-testid="kb-panel">
      {/* Upload */}
      <form onSubmit={upload} className="ls-card p-6 space-y-4" data-testid="kb-upload-form">
        <h3 className="font-display text-lg font-semibold text-[#1E2A4A]">Загрузить PDF-документ</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Название документа" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="kb-title" />
          <select value={form.subject_id} onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="kb-subject">
            <option value="">Предмет (необязательно)</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="Класс (напр. 11)" value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="kb-grade" />
          <select value={form.doc_type} onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))} className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="kb-doctype">
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} data-testid="kb-file" className="block w-full text-sm text-[#4B5563]" />
        <button type="submit" disabled={uploading} data-testid="kb-upload-btn" className="btn-accent inline-flex items-center gap-2 disabled:opacity-60">
          <Upload className="w-4 h-4" /> {uploading ? "Загрузка…" : "Загрузить и обработать"}
        </button>
      </form>

      {/* Documents */}
      <div>
        <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Документы ({docs.length})</h3>
        {docs.length === 0 ? (
          <div className="ls-card p-8 text-center text-[#8A94A6]">Пока нет загруженных документов</div>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => {
              const st = STATUS[d.status] || STATUS.processing;
              return (
                <div key={d.id} className="ls-card p-4 flex items-center gap-4" data-testid={`kb-doc-${d.id}`}>
                  <FileText className="w-8 h-8 text-[#7C66DC] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#1E2A4A] truncate">{d.title}</div>
                    <div className="text-xs text-[#8A94A6]">{d.filename} · {DOC_TYPES.find((t) => t[0] === d.doc_type)?.[1]} {d.status === "indexed" && `· ${d.pages} ${plural(d.pages, ["стр", "стр", "стр"])} · ${d.chunks} ${plural(d.chunks, ["фрагмент", "фрагмента", "фрагментов"])}`}{d.error && ` · ${d.error}`}</div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ color: st[1], background: st[2] }} data-testid={`kb-status-${d.id}`}>{st[0]}</span>
                  <button onClick={() => reprocess(d.id)} data-testid={`kb-reprocess-${d.id}`} className="p-2 rounded-lg text-[#7C66DC] hover:bg-[#EEEAFB]" title="Переиндексировать"><RefreshCw className="w-4 h-4" /></button>
                  <button onClick={() => del(d.id)} data-testid={`kb-delete-${d.id}`} className="p-2 rounded-lg text-[#EF4444] hover:bg-[#FEE2E2]"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Semantic search test */}
      <div className="ls-card p-6">
        <h3 className="font-display text-lg font-semibold text-[#1E2A4A] mb-3">Проверить поиск по базе (RAG)</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={searchSubject} onChange={(e) => setSearchSubject(e.target.value)} data-testid="kb-search-subject" className="px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]">
            <option value="">Все предметы</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="Например: производная функции" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()} className="flex-1 px-3 py-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3]" data-testid="kb-search-input" />
          <button onClick={search} data-testid="kb-search-btn" className="btn-primary inline-flex items-center gap-2"><Search className="w-4 h-4" /> Найти</button>
        </div>
        {results && (
          <div className="mt-4 space-y-2">
            {results.length === 0 ? <p className="text-sm text-[#8A94A6]">Ничего не найдено. Загрузи и проиндексируй документ.</p> :
              results.map((r, i) => (
                <div key={i} className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E5DEC9] text-sm">
                  <div className="text-xs text-[#7C66DC] font-medium mb-1">{r.doc_title} · стр. {r.page} · релевантность {r.score}</div>
                  <div className="text-[#4B5563]">{r.text.slice(0, 240)}…</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
