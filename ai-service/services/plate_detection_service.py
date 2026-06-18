import logging
from typing import Any

import numpy as np

from config.models import plate_model_path
from config.settings import settings
from services.inference_utils import yolo_imgsz
from services.model_registry import ModelStatus, resolve_device

logger = logging.getLogger(__name__)

_plate_model: Any = None
_plate_status = ModelStatus("plate_yolo", False, "cpu", "not loaded")


def load_plate_yolo(force: bool = False):
    global _plate_model, _plate_status

    if _plate_model is not None and not force:
        return _plate_model

    path = plate_model_path(settings.plate_yolo_model)
    if not path.exists():
        detail = f"missing weights: {path} — run scripts/download_models.py"
        _plate_status = ModelStatus("plate_yolo", False, "cpu", detail)
        raise RuntimeError(f"Plate YOLO weights not found at {path}")

    from ultralytics import YOLO

    device = resolve_device()
    try:
        _plate_model = YOLO(str(path))
        if device == "cuda":
            _plate_model.to("cuda")
        _plate_status = ModelStatus("plate_yolo", True, device, str(path))
        logger.info("Plate YOLO loaded: %s on %s", path, device)
    except Exception as exc:
        _plate_model = None
        _plate_status = ModelStatus("plate_yolo", False, device, str(exc))
        raise RuntimeError(f"Plate YOLO failed to load: {exc}") from exc

    return _plate_model


def get_plate_model_status() -> ModelStatus:
    if _plate_model is None:
        load_plate_yolo()
    return _plate_status


def detect_plates(frame: np.ndarray, confidence_threshold: float | None = None) -> list[dict[str, Any]]:
    model = load_plate_yolo()
    conf = confidence_threshold if confidence_threshold is not None else settings.plate_confidence_threshold
    imgsz = yolo_imgsz(frame.shape)

    results = model(frame, conf=conf, verbose=False, imgsz=imgsz, max_det=40)
    detections: list[dict[str, Any]] = []

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            cls_name = result.names.get(cls_id, "license_plate")
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            area = (x2 - x1) * (y2 - y1)
            if area < settings.min_plate_area:
                continue
            detections.append(
                {
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": float(box.conf[0]),
                    "bbox": [x1, y1, x2, y2],
                    "bbox_area": area,
                }
            )

    return detections


def is_plate_model_ready() -> bool:
    load_plate_yolo()
    return _plate_model is not None
