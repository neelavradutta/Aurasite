"""Decode dashboard snapshot for colour analysis (read-only; plate code unchanged)."""

from __future__ import annotations

import base64

import cv2
import numpy as np


def decode_dashboard_snapshot(record: dict) -> np.ndarray | None:
    encoded = record.get("dashboard_image_base64")
    if not isinstance(encoded, str) or not encoded.strip():
        return None
    try:
        buffer = np.frombuffer(base64.b64decode(encoded), dtype=np.uint8)
        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            return None
        return image
    except Exception:
        return None
