"""Vehicle colour pipeline orchestration."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from services.vehicle_color.classification import is_allowed_color
from services.vehicle_color.config import CONFIG
from services.vehicle_color.detection import resolve_vehicle_bbox
from services.vehicle_color.extraction import (
    fuse_extractions,
    histogram_dominant,
    kmeans_dominant,
    majority_vote_dominant,
    _sample_pixels,
)
from services.vehicle_color.preprocessing import normalize_crop
from services.vehicle_color.roi import (
    body_band_mask,
    paint_pixel_mask,
    snapshot_body_mask,
    snapshot_paint_mask,
)
from services.vehicle_color.tracking import update_track_color


def detect_color_on_crop(
    crop_bgr: np.ndarray,
    track_id: str | None = None,
    *,
    snapshot_mode: bool = False,
) -> dict[str, Any] | None:
    if crop_bgr.size == 0 or crop_bgr.shape[0] < 8 or crop_bgr.shape[1] < 8:
        return None

    working = crop_bgr
    max_side = 640 if snapshot_mode else 500
    if max(working.shape[0], working.shape[1]) > max_side:
        scale = max_side / max(working.shape[0], working.shape[1])
        working = cv2.resize(working, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    working = normalize_crop(working)
    lab = cv2.cvtColor(working, cv2.COLOR_BGR2LAB)
    hsv = cv2.cvtColor(working, cv2.COLOR_BGR2HSV)

    if snapshot_mode:
        body_mask = snapshot_body_mask(lab.shape[:2])
        paint_mask = snapshot_paint_mask(lab, hsv, body_mask)
        min_confidence = CONFIG.min_confidence_snapshot
    else:
        body_mask = body_band_mask(lab.shape[:2])
        paint_mask = paint_pixel_mask(lab, hsv, body_mask)
        min_confidence = CONFIG.min_confidence

    lab_pixels, hsv_pixels = _sample_pixels(lab, hsv, paint_mask)
    if lab_pixels.shape[0] < CONFIG.min_paint_pixels:
        return None

    fused = fuse_extractions(kmeans_dominant(lab_pixels, hsv_pixels), histogram_dominant(hsv_pixels))
    if not fused:
        fused = majority_vote_dominant(lab_pixels, hsv_pixels)
    if not fused:
        return None

    color, confidence = fused
    if not is_allowed_color(color) or confidence < min_confidence:
        return None

    hue = float(np.median(hsv_pixels[:, 0])) if hsv_pixels.shape[0] else 0.0
    if track_id:
        color, confidence = update_track_color(str(track_id), color, confidence, hue)

    height, width = crop_bgr.shape[:2]
    return {
        "color": color,
        "confidence": round(float(confidence), 3),
        "vehicle_bbox": [0, 0, width, height],
        "hue": round(hue, 2),
    }


def detect_color_from_frame(
    frame: np.ndarray,
    vehicle_hint: dict[str, Any] | None = None,
    anchor_bbox: list[int] | None = None,
    track_id: str | None = None,
) -> dict[str, Any] | None:
    bbox = resolve_vehicle_bbox(frame, vehicle_hint, anchor_bbox)
    if not bbox:
        return None

    x1, y1, x2, y2 = bbox
    crop = frame[y1:y2, x1:x2]
    result = detect_color_on_crop(crop, track_id)
    if result:
        result["vehicle_bbox"] = bbox
    return result
