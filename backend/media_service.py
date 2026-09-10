"""Image storage for task images and student solution uploads (GridFS-backed).
Normalizes uploads (HEIC->JPEG, resize, re-encode) and serves bytes for <img> display."""
import io
from PIL import Image
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson import ObjectId

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIC_OK = True
except Exception:
    _HEIC_OK = False

from db import db
from auth_utils import new_id, now_iso

media_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="media")

MAX_DIM = 1600  # px, longest side


def normalize_image(data: bytes) -> tuple[bytes, str]:
    """Return (bytes, content_type). Converts HEIC/other to JPEG/PNG, resizes, re-encodes.
    Raises ValueError if the payload is not a decodable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise ValueError(f"Не удалось прочитать изображение: {e}")

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    fmt = "PNG" if has_alpha else "JPEG"
    if fmt == "JPEG" and img.mode != "RGB":
        img = img.convert("RGB")
    elif fmt == "PNG" and img.mode not in ("RGBA", "RGB", "P", "LA"):
        img = img.convert("RGBA")

    w, h = img.size
    if max(w, h) > MAX_DIM:
        scale = MAX_DIM / float(max(w, h))
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    out = io.BytesIO()
    if fmt == "JPEG":
        img.save(out, format="JPEG", quality=85, optimize=True)
        ct = "image/jpeg"
    else:
        img.save(out, format="PNG", optimize=True)
        ct = "image/png"
    return out.getvalue(), ct


async def store_image(data: bytes, filename: str, owner_id: str = None, purpose: str = "task") -> dict:
    """Normalize and store an image. Returns a media record {media_id, url, content_type, ...}."""
    norm, ct = normalize_image(data)
    gridfs_id = await media_bucket.upload_from_stream(filename, norm)
    media_id = new_id()
    rec = {
        "id": media_id, "gridfs_id": str(gridfs_id), "filename": filename,
        "content_type": ct, "size": len(norm), "purpose": purpose,
        "owner_id": owner_id, "created_at": now_iso(),
    }
    await db.media_files.insert_one(dict(rec))
    rec.pop("_id", None)
    return {"media_id": media_id, "url": f"/api/media/{media_id}",
            "content_type": ct, "size": len(norm), "filename": filename}


async def get_image(media_id: str) -> tuple[bytes, str]:
    rec = await db.media_files.find_one({"id": media_id})
    if not rec:
        return None, None
    stream = await media_bucket.open_download_stream(ObjectId(rec["gridfs_id"]))
    return await stream.read(), rec.get("content_type", "image/jpeg")


async def get_image_base64(media_id: str) -> tuple[str, str]:
    """Return (base64_str, content_type) for feeding a multimodal model."""
    import base64
    data, ct = await get_image(media_id)
    if data is None:
        return None, None
    return base64.b64encode(data).decode("ascii"), ct


async def delete_image(media_id: str):
    rec = await db.media_files.find_one({"id": media_id})
    if not rec:
        return
    try:
        await media_bucket.delete(ObjectId(rec["gridfs_id"]))
    except Exception:
        pass
    await db.media_files.delete_one({"id": media_id})
