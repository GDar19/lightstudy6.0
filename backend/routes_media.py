from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from auth_utils import require_admin, get_current_user
import media_service

router = APIRouter()

MAX_UPLOAD = 12 * 1024 * 1024  # 12 MB


@router.post("/admin/media/upload")
async def admin_upload_media(
    file: UploadFile = File(...),
    purpose: str = Form("task"),
    admin: dict = Depends(require_admin),
):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 12 МБ)")
    try:
        return await media_service.store_image(data, file.filename or "image", admin["id"], purpose)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/media/upload")
async def user_upload_media(
    file: UploadFile = File(...),
    purpose: str = Form("solution"),
    user: dict = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 12 МБ)")
    try:
        return await media_service.store_image(data, file.filename or "image", user["id"], purpose)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/media/{media_id}")
async def serve_media(media_id: str):
    data, ct = await media_service.get_image(media_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    return Response(content=data, media_type=ct,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
