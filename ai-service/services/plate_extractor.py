"""Plate extraction, classification, and snapshot encoding."""

from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

from services.ocr_service import crop_bbox, prepare_snapshot_crop, recognize_plate
from services.batch_context import is_live_mode
from services.plate_quality import (
    detection_score,
    is_likely_half_plate,
    is_plate_bbox_valid,
    is_plate_like,
    plate_key,
    plates_are_similar,
    should_accept_detection,
)

Quality = str  # accepted | partial | unreadable | invalid


def _shared_fragment(left: str, right: str, min_len: int = 4) -> bool:
    if len(left) < min_len or len(right) < min_len:
        return False
    shorter, longer = sorted((left, right), key=len)
    for start in range(len(shorter)):
        for end in range(start + min_len, len(shorter) + 1):
            if shorter[start:end] in longer:
                return True
    return False


def classify_plate_detection(
    ocr: dict[str, Any],
    bbox: list[int],
    frame_shape: tuple[int, ...],
    min_confidence: float,
) -> tuple[Quality, str]:
    text = plate_key(str(ocr.get("cleaned_text", "")))
    confidence = float(ocr.get("confidence", 0))

    if not is_plate_bbox_valid(bbox, frame_shape):
        return "invalid", "UNREADABLE"

    if not text or text in {"UNKNOWN", "REJECTED"}:
        return "unreadable", "UNREADABLE"

    if text.isdigit() or len(text) <= 2:
        return "unreadable", "UNREADABLE"

    if should_accept_detection(ocr, bbox, frame_shape, min_confidence):
        return "accepted", text

    partial_floor = 0.28 if is_live_mode() else 0.45
    if confidence < partial_floor:
        return "unreadable", "UNREADABLE"

    if len(text) >= 3 or is_likely_half_plate(bbox, frame_shape) or not is_plate_like(text):
        return "partial", text

    return "unreadable", "UNREADABLE"


def encode_plate_snapshot(frame: np.ndarray, bbox: list[int]) -> str | None:
    crop = crop_bbox(frame, bbox, pad=0.15)
    if crop.size == 0:
        return None

    snapshot = prepare_snapshot_crop(crop)
    ok, buffer = cv2.imencode(".jpg", snapshot, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        return None

    return base64.b64encode(buffer).decode("ascii")


def _scene_bbox(
    vehicle: dict[str, Any] | None,
    plate_bbox: list[int],
    frame_shape: tuple[int, ...],
) -> list[int]:
    """Wide vehicle snapshot crop — reference padding around plate bbox."""
    h, w = frame_shape[:2]
    px1, py1, px2, py2 = plate_bbox
    pw = max(px2 - px1, 1)
    ph = max(py2 - py1, 1)
    frame_area = max(w * h, 1)
    plate_area = pw * ph

    # Oversized plate boxes (rear-of-car detections) need a tight crop, not full-frame padding.
    if plate_area > frame_area * 0.12:
        pad_x = max(int(pw * 0.12), 16)
        pad_y = max(int(ph * 0.18), 12)
        return [
            max(0, px1 - pad_x),
            max(0, py1 - pad_y),
            min(w, px2 + pad_x),
            min(h, py2 + pad_y),
        ]

    pad_x = max(int(pw * 4), 120)
    pad_y = max(int(ph * 5), 90)
    x1 = max(0, px1 - pad_x)
    y1 = max(0, py1 - pad_y)
    x2 = min(w, px2 + pad_x)
    y2 = min(h, py2 + pad_y)

    vehicle_bbox = (vehicle or {}).get("bbox")
    if vehicle_bbox and len(vehicle_bbox) >= 4:
        vx1, vy1, vx2, vy2 = [int(v) for v in vehicle_bbox[:4]]
        vehicle_area = max(vx2 - vx1, 1) * max(vy2 - vy1, 1)
        if vehicle_area <= frame_area * 0.45 and vehicle_area <= plate_area * 12:
            x1 = min(x1, vx1)
            y1 = min(y1, vy1)
            x2 = max(x2, vx2)
            y2 = max(y2, vy2)

    x1 = min(x1, px1)
    y1 = min(y1, py1)
    x2 = max(x2, px2)
    y2 = max(y2, py2)
    return [x1, y1, x2, y2]


def _fit_dashboard_image(crop: np.ndarray, max_side: int = 960) -> np.ndarray:
    h, w = crop.shape[:2]
    longest = max(h, w)
    if is_live_mode():
        max_side = min(max_side, 640)
    if longest <= max_side:
        return crop
    scale = max_side / longest
    return cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def encode_full_frame_snapshot(frame: np.ndarray) -> str | None:
    """Use the entire uploaded image as the dashboard snapshot."""
    if frame.size == 0:
        return None

    snapshot = _fit_dashboard_image(frame)
    ok, buffer = cv2.imencode(".jpg", snapshot, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        return None

    return base64.b64encode(buffer).decode("ascii")


def encode_dashboard_snapshot(
    frame: np.ndarray,
    vehicle: dict[str, Any] | None,
    plate_bbox: list[int],
) -> str | None:
    scene = _scene_bbox(vehicle, plate_bbox, frame.shape)
    crop = frame[scene[1] : scene[3], scene[0] : scene[2]]
    if crop.size == 0:
        return None

    snapshot = _fit_dashboard_image(crop)
    quality = 78 if is_live_mode() else 90
    ok, buffer = cv2.imencode(".jpg", snapshot, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None

    return base64.b64encode(buffer).decode("ascii")


def extract_plate_record(
    frame: np.ndarray,
    plate_det: dict[str, Any],
    frame_id: int,
    timestamp: float,
    vehicle: dict[str, Any] | None,
    track_id: str,
    min_confidence: float,
) -> dict[str, Any] | None:
    bbox = plate_det["bbox"]
    ocr = recognize_plate(frame, bbox, frame_id)
    quality, display_plate = classify_plate_detection(ocr, bbox, frame.shape, min_confidence)

    if quality == "invalid":
        return None

    live = is_live_mode()
    plate_snapshot = None if live else encode_plate_snapshot(frame, bbox)
    dashboard_snapshot = None
    if quality in ("accepted", "partial") and display_plate not in {"UNREADABLE", "UNKNOWN", "REJECTED"}:
        dashboard_snapshot = encode_dashboard_snapshot(frame, vehicle, bbox)
    if quality == "accepted" and not dashboard_snapshot:
        dashboard_snapshot = encode_plate_snapshot(frame, bbox) if live else plate_snapshot

    ocr = {**ocr, "cleaned_text": display_plate, "detection_quality": quality}

    vehicle_payload: dict[str, Any] = vehicle or {
        "class_name": "unknown",
        "confidence": 0.0,
        "bbox": bbox,
    }

    return {
        "frame_id": frame_id,
        "timestamp": timestamp,
        "vehicle": vehicle_payload,
        "plate_detection": plate_det,
        "plate": ocr,
        "plate_number": display_plate,
        "detection_quality": quality,
        "plate_bbox": bbox,
        "track_id": track_id,
        "pipeline_mode": "plate_yolo",
        "plate_image_base64": plate_snapshot,
        "dashboard_image_base64": dashboard_snapshot,
        "_score": detection_score(ocr, bbox),
    }


def pick_best_accepted_per_plate(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One dashboard card per consolidated plate (best snapshot)."""
    accepted = [r for r in records if r.get("detection_quality") == "accepted"]
    prefer_shorter = any(str(r.get("pipeline_mode", "")) == "video_batch" for r in records)
    ranked = sorted(
        accepted,
        key=lambda item: (
            len(plate_key(str(item.get("plate_number", "")))),
            -float(item.get("_score", 0)),
        ),
        reverse=not prefer_shorter,
    )
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []

    for item in ranked:
        key = plate_key(str(item.get("plate_number", "")))
        if not key or not is_plate_like(key):
            continue

        dominated = False
        for existing in unique:
            existing_key = plate_key(str(existing.get("plate_number", "")))
            if plates_are_similar(existing_key, key):
                dominated = True
                break
            shorter, longer = sorted((key, existing_key), key=len)
            if shorter != longer and _shared_fragment(shorter, longer):
                if prefer_shorter and key == longer:
                    dominated = True
                    break
                if not prefer_shorter:
                    dominated = True
                    break
        if dominated:
            continue

        if key in seen:
            continue
        seen.add(key)
        unique.append({k: v for k, v in item.items() if k != "_score"})

    return unique
