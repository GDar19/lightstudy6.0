"""Knowledge Base: PDF ingestion (stored in GridFS), text chunking with page numbers,
page figure/image extraction (linked to page), and lexical retrieval (TF-IDF cosine) for
multimodal RAG (returns relevant text chunks + relevant figures)."""
import re
from io import BytesIO
import pymupdf
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from bson import ObjectId

from db import db, clean_list
from auth_utils import new_id, now_iso
import media_service

bucket = AsyncIOMotorGridFSBucket(db)

MIN_FIG_DIM = 80        # px — skip tiny logos/bullets
MIN_FIG_BYTES = 3500    # skip tiny artifacts


async def store_file(data: bytes, filename: str) -> str:
    file_id = await bucket.upload_from_stream(filename, data)
    return str(file_id)


async def read_file(gridfs_id: str) -> bytes:
    stream = await bucket.open_download_stream(ObjectId(gridfs_id))
    return await stream.read()


async def delete_file(gridfs_id: str):
    try:
        await bucket.delete(ObjectId(gridfs_id))
    except Exception:
        pass


async def _delete_figures(doc_id: str):
    figs = await db.kb_figures.find({"doc_id": doc_id}).to_list(2000)
    for f in figs:
        if f.get("media_id"):
            await media_service.delete_image(f["media_id"])
    await db.kb_figures.delete_many({"doc_id": doc_id})


def _chunk(text: str, size: int = 900, overlap: int = 150):
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i:i + size])
        i += size - overlap
    return chunks


async def process_document(doc_id: str):
    doc = await db.kb_documents.find_one({"id": doc_id})
    if not doc:
        return
    await db.kb_documents.update_one({"id": doc_id}, {"$set": {"status": "processing", "error": None}})
    await db.kb_chunks.delete_many({"doc_id": doc_id})
    await _delete_figures(doc_id)
    try:
        data = await read_file(doc["gridfs_id"])
        pdf = pymupdf.open(stream=data, filetype="pdf")
        total_chunks, total_figs = 0, 0
        seen_xref = set()
        for pnum, page in enumerate(pdf, start=1):
            text = page.get_text() or ""
            for ch in _chunk(text):
                if len(ch.strip()) < 40:
                    continue
                await db.kb_chunks.insert_one({
                    "id": new_id(), "doc_id": doc_id, "subject_id": doc.get("subject_id"),
                    "grade": doc.get("grade"), "doc_title": doc.get("title"),
                    "page": pnum, "text": ch, "created_at": now_iso(),
                })
                total_chunks += 1
            # extract figures on this page
            for img in page.get_images(full=True):
                xref = img[0]
                if xref in seen_xref:
                    continue
                seen_xref.add(xref)
                try:
                    base = pdf.extract_image(xref)
                except Exception:
                    continue
                ibytes = base.get("image")
                w, h = base.get("width", 0), base.get("height", 0)
                if not ibytes or len(ibytes) < MIN_FIG_BYTES:
                    continue
                if w and h and (w < MIN_FIG_DIM or h < MIN_FIG_DIM):
                    continue
                try:
                    media = await media_service.store_image(
                        ibytes, f"{doc_id}_p{pnum}_{xref}.{base.get('ext', 'png')}", purpose="kb_figure")
                except Exception:
                    continue
                await db.kb_figures.insert_one({
                    "id": new_id(), "doc_id": doc_id, "subject_id": doc.get("subject_id"),
                    "grade": doc.get("grade"), "doc_title": doc.get("title"), "page": pnum,
                    "media_id": media["media_id"], "url": media["url"],
                    "width": w, "height": h, "created_at": now_iso(),
                })
                total_figs += 1
        pages = pdf.page_count
        pdf.close()
        await db.kb_documents.update_one({"id": doc_id}, {"$set": {
            "status": "indexed", "pages": pages, "chunks": total_chunks,
            "figures": total_figs, "indexed_at": now_iso(),
        }})
    except Exception as e:
        await db.kb_documents.update_one({"id": doc_id}, {"$set": {"status": "error", "error": str(e)[:300]}})


async def retrieve(subject_id: str, query: str, k: int = 4):
    q = {"subject_id": subject_id} if subject_id else {}
    chunks = clean_list(await db.kb_chunks.find(q).to_list(4000))
    if not chunks or not query:
        return []
    corpus = [c["text"] for c in chunks]
    try:
        vec = TfidfVectorizer(max_features=6000)
        matrix = vec.fit_transform(corpus + [query])
        sims = cosine_similarity(matrix[-1], matrix[:-1]).ravel()
    except Exception:
        return []
    ranked = sorted(zip(sims, chunks), key=lambda x: x[0], reverse=True)
    out = []
    for score, c in ranked[:k]:
        if score <= 0.01:
            continue
        out.append({"text": c["text"], "page": c["page"], "doc_title": c["doc_title"],
                    "doc_id": c["doc_id"], "score": round(float(score), 3)})
    return out


async def retrieve_figures(snippets, max_images: int = 3):
    """Return figure records located on the same doc+page as the top retrieved text chunks."""
    if not snippets:
        return []
    figs, seen = [], set()
    for s in snippets:
        cursor = db.kb_figures.find({"doc_id": s["doc_id"], "page": s["page"]}).limit(max_images)
        for f in clean_list(await cursor.to_list(max_images)):
            if f["media_id"] in seen:
                continue
            seen.add(f["media_id"])
            figs.append({"media_id": f["media_id"], "url": f["url"], "page": f["page"],
                         "doc_title": f["doc_title"], "doc_id": f["doc_id"]})
            if len(figs) >= max_images:
                return figs
    return figs


async def retrieve_multimodal(subject_id: str, query: str, k: int = 4, max_images: int = 3):
    """Text snippets + relevant figures + their base64 payloads for a multimodal model."""
    snippets = await retrieve(subject_id, query, k=k)
    figures = await retrieve_figures(snippets, max_images=max_images)
    images_b64 = []
    for f in figures:
        b64, _ = await media_service.get_image_base64(f["media_id"])
        if b64:
            images_b64.append(b64)
    return {"snippets": snippets, "figures": figures, "images_b64": images_b64}


def build_rag_context(snippets, figures=None):
    if not snippets and not figures:
        return "", []
    lines = ["Используй следующие материалы из загруженных учебников как источник (цитируй факты точно):"]
    sources = []
    for s in (snippets or []):
        lines.append(f"[{s['doc_title']}, стр. {s['page']}]: {s['text'][:600]}")
        sources.append({"type": "text", "doc_id": s["doc_id"], "doc_title": s["doc_title"], "page": s["page"]})
    if figures:
        lines.append("К этим страницам приложены изображения/иллюстрации из учебника — учитывай их при ответе.")
        for f in figures:
            sources.append({"type": "figure", "doc_id": f["doc_id"], "doc_title": f["doc_title"],
                            "page": f["page"], "url": f["url"], "media_id": f["media_id"]})
    return "\n".join(lines), sources
