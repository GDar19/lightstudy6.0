"""Probe: inspect kb_chunks content and TF-IDF retrieval directly (RCA for empty search)."""
import os

from dotenv import load_dotenv
from pymongo import MongoClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv("/app/backend/.env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

docs = list(db.kb_documents.find({}, {"gridfs_id": 0, "_id": 0}))
print(f"documents: {len(docs)}")
for d in docs:
    print("  ", d.get("id"), "|", d.get("title"), "| status=", d.get("status"),
          "| pages=", d.get("pages"), "| chunks=", d.get("chunks"), "| subject=", d.get("subject_id"))

chunks = list(db.kb_chunks.find({}, {"_id": 0}))
print(f"\nchunks: {len(chunks)}")
for c in chunks:
    print("  doc=", c["doc_id"], "page=", c["page"], "subject=", c.get("subject_id"))
    print("   text repr:", repr(c["text"][:400]))

if chunks:
    corpus = [c["text"] for c in chunks]
    for q in ["производная функции", "derivative function", "derivative", "maximum of y"]:
        vec = TfidfVectorizer(max_features=6000)
        m = vec.fit_transform(corpus + [q])
        sims = cosine_similarity(m[-1], m[:-1]).ravel()
        print(f"\nquery={q!r} raw sims={sims} -> kept(>0.01)={[round(float(s),3) for s in sims if s > 0.01]}")
