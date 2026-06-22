import time

from fastapi import APIRouter

from config.settings import settings
from services.model_registry import cuda_is_available, model_status_payload, resolve_device

router = APIRouter(prefix="/api/v1", tags=["health"])
START_TIME = time.time()


@router.get("/health")
async def health_check():
    status = model_status_payload()
    all_loaded = (
        status["vehicle_yolo"]["loaded"]
        and status["plate_yolo"]["loaded"]
        and status["ocr"]["loaded"]
    )
    return {
        "status": "healthy" if all_loaded else "degraded",
        "models_loaded": {
            "vehicle_yolo": status["vehicle_yolo"]["loaded"],
            "plate_yolo": status["plate_yolo"]["loaded"],
            "ocr": status["ocr"]["loaded"],
        },
        "production_ready": all_loaded,
        "gpu_available": cuda_is_available(),
        "using_gpu": resolve_device() == "cuda",
        "gpu_auto_enabled": settings.gpu_enabled,
        "uptime_seconds": int(time.time() - START_TIME),
    }


@router.get("/models/status")
async def model_status():
    payload = model_status_payload()
    payload["uptime"] = int(time.time() - START_TIME)
    return payload
