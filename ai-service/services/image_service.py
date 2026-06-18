from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable

import cv2
import numpy as np

from services.image_detection import run_image_detection_pipeline

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, int], None]

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".gif",
    ".heic",
    ".heif",
    ".avif",
    ".jfif",
}


def is_image_path(path: str) -> bool:
    if not path:
        return False
    ext = os.path.splitext(path)[1].lower()
    return ext in IMAGE_EXTENSIONS


def load_image_file(image_path: str) -> np.ndarray:
    frame = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if frame is not None and frame.size > 0:
        return frame

    try:
        from PIL import Image

        with Image.open(image_path) as img:
            rgb = img.convert("RGB")
            return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    except Exception as exc:
        logger.warning("Failed to load image %s: %s", image_path, exc)
        raise ValueError("invalid_image_format") from exc


def process_image_file(
    image_path: str,
    confidence_threshold: float = 0.5,
    min_plate_confidence: float = 0.7,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Image upload entry point — uses the dedicated image detection pipeline."""
    frame = load_image_file(image_path)
    return run_image_detection_pipeline(
        frame,
        confidence_threshold=confidence_threshold,
        min_plate_confidence=min_plate_confidence,
        progress_callback=progress_callback,
    )
