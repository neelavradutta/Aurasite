import asyncio
import json
import logging
import os
import shutil
import tempfile
import threading
import uuid

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from config.settings import settings
from services import job_progress
from services.image_service import IMAGE_EXTENSIONS, is_image_path, process_image_file
from services.video_service import VideoProcessor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["detection"])
processor = VideoProcessor()
_job_lock = threading.Lock()

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".wmv", ".flv", ".m4v"}


def _is_video_upload(upload: UploadFile) -> bool:
    content_type = upload.content_type or ""
    if content_type.startswith("video/"):
        return True
    filename = (upload.filename or "").lower()
    return any(filename.endswith(ext) for ext in VIDEO_EXTENSIONS)


def _is_image_upload(upload: UploadFile) -> bool:
    content_type = upload.content_type or ""
    if content_type.startswith("image/"):
        return True
    filename = (upload.filename or "").lower()
    return any(filename.endswith(ext) for ext in IMAGE_EXTENSIONS)


def _resolve_media_kind(
    upload: UploadFile,
    temp_path: str,
    opts: dict,
    *,
    force_image: bool = False,
) -> str:
    if force_image or opts.get("media_type") == "image":
        return "image"
    if is_image_path(temp_path) or _is_image_upload(upload):
        return "image"
    return "video"


def _run_media_job(job_id: str, temp_path: str, opts: dict, *, is_image: bool) -> None:
    # Isolated inference lock — image and video use separate detection pipelines.
    max_frames = 1 if is_image else int(opts.get("max_frames") or settings.max_frames)

    try:
        def on_progress(processed: int, target: int) -> None:
            job_progress.update_frames(job_id, processed, target)

        with _job_lock:
            if is_image:
                data = process_image_file(
                    temp_path,
                    float(opts.get("confidence_threshold", settings.confidence_threshold)),
                    float(opts.get("min_plate_confidence", settings.min_plate_confidence)),
                    progress_callback=on_progress,
                )
            else:
                job_processor = VideoProcessor()
                data = job_processor.process_video(
                    temp_path,
                    int(opts.get("frame_skip", settings.frame_skip)),
                    float(opts.get("confidence_threshold", settings.confidence_threshold)),
                    float(opts.get("min_plate_confidence", settings.min_plate_confidence)),
                    max_frames,
                    progress_callback=on_progress,
                )

        job_progress.complete_job(job_id, data)
        if is_image and int(data.get("total_detections") or 0) == 0:
            logger.warning("Image job completed with zero detections: %s (%s)", job_id, temp_path)
    except Exception as exc:
        logger.exception("Async media job failed: %s", job_id)
        job_progress.fail_job(job_id, str(exc))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/detect/jobs/{job_id}")
async def get_detect_job(job_id: str):
    job = job_progress.get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "error": "job_not_found",
                "message": "Processing job not found",
                "status_code": 404,
            },
        )
    return {"success": True, "data": job}


def _parse_options(options: str) -> tuple[dict, JSONResponse | None]:
    try:
        return json.loads(options), None
    except json.JSONDecodeError:
        return {}, JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "invalid_options",
                "message": "Options must be valid JSON",
                "status_code": 400,
            },
        )


async def _handle_media_upload(
    upload: UploadFile,
    opts: dict,
    *,
    force_image: bool = False,
) -> dict | JSONResponse:
    is_image = force_image or _is_image_upload(upload)
    is_video = _is_video_upload(upload)

    if force_image and not is_image and not is_image_path(upload.filename or ""):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "invalid_image_format",
                "message": "Uploaded file is not a supported image",
                "status_code": 400,
            },
        )

    if not force_image and not is_video and not is_image:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "invalid_media_format",
                "message": "Uploaded file must be a supported video or image",
                "status_code": 400,
            },
        )

    default_suffix = ".jpg" if (force_image or is_image) else ".mp4"
    suffix = os.path.splitext(upload.filename or default_suffix)[1] or default_suffix
    temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}{suffix}")
    job_id = opts.get("job_id")

    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(upload.file, f)

        media_kind = _resolve_media_kind(upload, temp_path, opts, force_image=force_image)

        if job_id:
            max_frames = 1 if media_kind == "image" else int(opts.get("max_frames") or settings.max_frames)
            job_progress.create_job(str(job_id), max_frames)
            logger.info("Starting async %s job: %s (%s)", media_kind, job_id, upload.filename)
            threading.Thread(
                target=_run_media_job,
                args=(str(job_id), temp_path, opts),
                kwargs={"is_image": media_kind == "image"},
                daemon=True,
            ).start()
            return {
                "success": True,
                "data": {"job_id": job_id, "status": "processing", "media_type": media_kind},
                "message": f"{media_kind.capitalize()} queued for processing",
            }

        logger.info("Processing %s upload: %s", media_kind, upload.filename)
        if media_kind == "image":
            data = await asyncio.to_thread(
                process_image_file,
                temp_path,
                float(opts.get("confidence_threshold", settings.confidence_threshold)),
                float(opts.get("min_plate_confidence", settings.min_plate_confidence)),
            )
        else:
            data = await asyncio.to_thread(
                processor.process_video,
                temp_path,
                int(opts.get("frame_skip", settings.frame_skip)),
                float(opts.get("confidence_threshold", settings.confidence_threshold)),
                float(opts.get("min_plate_confidence", settings.min_plate_confidence)),
                int(opts.get("max_frames") or settings.max_frames),
            )

        return {
            "success": True,
            "data": data,
            "message": "Processing complete",
        }
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(exc),
                "message": "Media processing failed",
                "status_code": 400,
            },
        )
    except Exception as exc:
        logger.exception("Detection failed")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "processing_error",
                "message": str(exc),
                "status_code": 500,
            },
        )
    finally:
        if not job_id and os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/detect")
async def detect_video(
    video_file: UploadFile = File(...),
    options: str = Form("{}"),
):
    opts, error = _parse_options(options)
    if error:
        return error
    result = await _handle_media_upload(video_file, opts, force_image=False)
    return result


@router.post("/detect/image")
async def detect_image(
    video_file: UploadFile = File(...),
    options: str = Form("{}"),
):
    opts, error = _parse_options(options)
    if error:
        return error
    result = await _handle_media_upload(video_file, opts, force_image=True)
    return result


@router.post("/stream/detect")
async def stream_detect(
    frame: UploadFile = File(...),
    frame_number: int = Form(0),
    timestamp: float = Form(0.0),
):
    try:
        frame_bytes = await frame.read()
        result = processor.process_frame(frame_bytes, frame_number, timestamp)
        return {"success": True, "data": result}
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(exc),
                "message": "Frame processing failed",
                "status_code": 400,
            },
        )
