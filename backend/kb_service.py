"""Knowledge Base: PDF ingestion (stored in GridFS), chunking with page numbers,
lexical/semantic retrieval (TF-IDF cosine) for RAG."""
import re
from io import BytesIO
from pypdf import PdfReader
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from bson import ObjectId

from db import db, clean_list
from auth_utils import new_id, now_iso

bucket = AsyncIOMotorGridFSBucket(db)


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
    try:
        data = await read_file(doc["gridfs_id"])
        reader = PdfReader(BytesIO(data))
        total = 0
        for pnum, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            for ch in _chunk(text):
                if len(ch.strip()) < 40:
                    continue
                await db.kb_chunks.insert_one({
                    "id": new_id(), "doc_id": doc_id, "subject_id": doc.get("subject_id"),
                    "grade": doc.get("grade"), "doc_title": doc.get("title"),
                    "page": pnum, "text": ch, "created_at": now_iso(),
                })
                total += 1
        await db.kb_documents.update_one({"id": doc_id}, {"$set": {
            "status": "indexed", "pages": len(reader.pages), "chunks": total, "indexed_at": now_iso(),
        }})
    except Exception as e:
        await db.kb_documents.update_one({"id": doc_id}, {"$set": {"status": "error", "error": str(e)[:300]}})


async def retrieve(subject_id: str, query: str, k: int = 4):
    q = {"subject_id": subject_id} if subject_id else {}
    chunks = clean_list(await db.kb_chunks.find(q).to_list(2000))
    if not chunks and subject_id:
        chunks = clean_list(await db.kb_chunks.find({}).to_list(2000))
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


def build_rag_context(snippets):
    if not snippets:
        return "", []
    lines = ["Используй следующие материалы из загруженных учебников как источник (цитируй факты точно):"]
    sources = []
    for s in snippets:
        lines.append(f"[{s['doc_title']}, стр. {s['page']}]: {s['text'][:600]}")
        sources.append({"doc_id": s["doc_id"], "doc_title": s["doc_title"], "page": s["page"]})
    return "\n".join(lines), sources
