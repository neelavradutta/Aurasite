import logging
from typing import Any

import numpy as np

from config.models import vehicle_model_path
from config.settings import settings
from services.inference_utils import yolo_imgsz
from services.model_registry import ModelStatus, resolve_device

logger = logging.getLogger(__name__)

_vehicle_model: Any = None
_vehicle_status = ModelStatus("vehicle_yolo", False, "cpu", "not loaded")


def load_yolo(force: bool = False):
    global _vehicle_model, _vehicle_status

    if _vehicle_model is not None and not force:
        return _vehicle_model

    from ultralytics import YOLO

    model_name = vehicle_model_path(settings.yolo_model)
    device = resolve_device()
    try:
        _vehicle_model = YOLO(model_name)
        if device == "cuda":
            _vehicle_model.to("cuda")
        _vehicle_status = ModelStatus("vehicle_yolo", True, device, model_name)
        logger.info("Vehicle YOLO loaded: %s on %s", model_name, device)
    except Exception as exc:
        _vehicle_model = None
        _vehicle_status = ModelStatus("vehicle_yolo", False, device, str(exc))
        raise RuntimeError(f"Vehicle YOLO failed to load: {exc}") from exc

    return _vehicle_model


def get_vehicle_model_status() -> ModelStatus:
    if _vehicle_model is None:
        load_yolo()
    return _vehicle_status


def detect_vehicles(frame: np.ndarray, confidence_threshold: float | None = None) -> list[dict[str, Any]]:
    model = load_yolo()
    conf = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold

    results = model(frame, conf=conf, verbose=False, imgsz=yolo_imgsz(frame.shape), max_det=40)
    detections: list[dict[str, Any]] = []
    allowed = {"car", "truck", "bus", "motorcycle", "bicycle", "van"}

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            cls_name = result.names.get(cls_id, "unknown")
            if cls_name not in allowed:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            area = (x2 - x1) * (y2 - y1)
            if area < settings.min_bbox_area:
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
