import logging
from dataclasses import dataclass
from typing import Any

from config.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class ModelStatus:
    name: str
    loaded: bool
    device: str
    detail: str = ""


def resolve_device() -> str:
    if settings.gpu_enabled:
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
    return "cpu"


def model_status_payload() -> dict[str, Any]:
    from services.detection_service import get_vehicle_model_status
    from services.plate_detection_service import get_plate_model_status
    from services.ocr_service import get_ocr_model_status

    vehicle = get_vehicle_model_status()
    plate = get_plate_model_status()
    ocr = get_ocr_model_status()
    device = resolve_device()

    return {
        "device": device,
        "vehicle_yolo": {
            "model": settings.yolo_model,
            "loaded": vehicle.loaded,
            "device": vehicle.device,
            "detail": vehicle.detail,
        },
        "plate_yolo": {
            "model": str(settings.plate_yolo_model),
            "loaded": plate.loaded,
            "device": plate.device,
            "detail": plate.detail,
        },
        "ocr": {
            "model": "paddleocr",
            "loaded": ocr.loaded,
            "device": ocr.device,
            "detail": ocr.detail,
        },
        "pipeline": settings.anpr_pipeline,
    }


def verify_production_models() -> None:
    """Fail startup if any required ML model is not loaded."""
    status = model_status_payload()
    errors: list[str] = []
    for key in ("vehicle_yolo", "plate_yolo", "ocr"):
        model = status[key]
        if not model["loaded"]:
            errors.append(f"{key}: {model['detail']}")
    if errors:
        raise RuntimeError("Required ML models failed to load — " + "; ".join(errors))
