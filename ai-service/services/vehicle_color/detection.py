"""Vehicle YOLO bbox resolution — colour module only; never uses plate ROI."""

from __future__ import annotations

from typing import Any

import numpy as np

from services.vehicle_color.config import CONFIG


def _center(bbox: list[int]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _iou(left: list[int], right: list[int]) -> float:
    lx1, ly1, lx2, ly2 = left
    rx1, ry1, rx2, ry2 = right
    ix1, iy1 = max(lx1, rx1), max(ly1, ry1)
    ix2, iy2 = min(lx2, rx2), min(ly2, ry2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = max(1, (lx2 - lx1) * (ly2 - ly1)) + max(1, (rx2 - rx1) * (ry2 - ry1)) - inter
    return inter / union


def _clamp_bbox(bbox: list[int], frame_w: int, frame_h: int) -> list[int]:
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(x1, frame_w - 1))
    y1 = max(0, min(y1, frame_h - 1))
    x2 = max(x1 + 1, min(x2, frame_w))
    y2 = max(y1 + 1, min(y2, frame_h))
    return [x1, y1, x2, y2]


def _pad_vehicle_bbox(bbox: list[int], frame_w: int, frame_h: int) -> list[int]:
    x1, y1, x2, y2 = bbox
    width = max(x2 - x1, 1)
    height = max(y2 - y1, 1)
    padded = [
        int(x1 - width * CONFIG.horizontal_pad),
        int(y1 - height * CONFIG.vertical_pad_top),
        int(x2 + width * CONFIG.horizontal_pad),
        int(y2 + height * CONFIG.vertical_pad_bottom),
    ]
    return _clamp_bbox(padded, frame_w, frame_h)


def _bbox_area(bbox: list[int]) -> int:
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def _is_plate_fallback_bbox(vehicle: dict[str, Any], plate_bbox: list[int] | None) -> bool:
    if not plate_bbox or len(plate_bbox) < 4:
        return False
    vb = vehicle.get("bbox")
    if not isinstance(vb, (list, tuple)) or len(vb) < 4:
        return False
    vehicle_box = [int(v) for v in vb[:4]]
    plate_box = [int(v) for v in plate_bbox[:4]]
    if vehicle_box == plate_box:
        return True
    vehicle_area = _bbox_area(vehicle_box)
    plate_area = _bbox_area(plate_box)
    if plate_area <= 0:
        return False
    ratio = vehicle_area / plate_area
    return ratio < 1.35


def _valid_vehicle_area(bbox: list[int], frame_shape: tuple[int, ...]) -> bool:
    area = _bbox_area(bbox)
    if area < CONFIG.min_vehicle_area:
        return False
    frame_area = frame_shape[0] * frame_shape[1]
    return area <= frame_area * CONFIG.max_area_ratio


def _has_yolo_vehicle_hint(vehicle: dict[str, Any]) -> bool:
    if float(vehicle.get("confidence", 0) or 0) > 0:
        return True
    class_name = str(vehicle.get("class_name", "unknown")).lower()
    return class_name not in {"", "unknown"}


def _run_vehicle_yolo(frame: np.ndarray) -> list[dict[str, Any]]:
    from services.detection_service import detect_vehicles

    detections = detect_vehicles(frame, confidence_threshold=CONFIG.yolo_confidence)
    if detections:
        return detections
    return detect_vehicles(frame, confidence_threshold=CONFIG.yolo_confidence_fallback)


def _pick_vehicle_for_anchor(detections: list[dict[str, Any]], anchor: list[int], frame_shape: tuple[int, ...]) -> list[int] | None:
    anchor_center = _center(anchor)
    best_box: list[int] | None = None
    best_score = -1.0

    for det in detections:
        box = det.get("bbox")
        if not isinstance(box, (list, tuple)) or len(box) < 4:
            continue
        vehicle_box = [int(v) for v in box[:4]]
        if not _valid_vehicle_area(vehicle_box, frame_shape):
            continue

        overlap = _iou(anchor, vehicle_box)
        center_inside = (
            vehicle_box[0] <= anchor_center[0] <= vehicle_box[2]
            and vehicle_box[1] <= anchor_center[1] <= vehicle_box[3]
        )
        score = overlap * 2.5 + float(det.get("confidence", 0))
        if center_inside:
            score += 0.35
        if score > best_score:
            best_score = score
            best_box = vehicle_box

    return best_box


def resolve_vehicle_bbox(
    frame: np.ndarray,
    vehicle_hint: dict[str, Any] | None,
    anchor_bbox: list[int] | None = None,
) -> list[int] | None:
    frame_h, frame_w = frame.shape[:2]

    if vehicle_hint and isinstance(vehicle_hint.get("bbox"), (list, tuple)) and len(vehicle_hint["bbox"]) >= 4:
        if _has_yolo_vehicle_hint(vehicle_hint) and not _is_plate_fallback_bbox(vehicle_hint, anchor_bbox):
            hint_box = _pad_vehicle_bbox([int(v) for v in vehicle_hint["bbox"][:4]], frame_w, frame_h)
            if _valid_vehicle_area(hint_box, frame.shape):
                return hint_box

    detections = _run_vehicle_yolo(frame)
    if not detections:
        return None

    if anchor_bbox and len(anchor_bbox) >= 4:
        anchor = [int(v) for v in anchor_bbox[:4]]
        matched = _pick_vehicle_for_anchor(detections, anchor, frame.shape)
        if matched:
            return _pad_vehicle_bbox(matched, frame_w, frame_h)

    ranked = sorted(
        (
            det
            for det in detections
            if isinstance(det.get("bbox"), (list, tuple)) and len(det["bbox"]) >= 4
        ),
        key=lambda item: float(item.get("confidence", 0)) * float(item.get("bbox_area", 1)),
        reverse=True,
    )
    for det in ranked:
        box = [int(v) for v in det["bbox"][:4]]
        if _valid_vehicle_area(box, frame.shape):
            return _pad_vehicle_bbox(box, frame_w, frame_h)

    return None
