"""Logo / grille ROI — region directly above the detected number plate."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def _clamp_bbox(bbox: list[int], frame_w: int, frame_h: int) -> list[int]:
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(x1, frame_w - 1))
    y1 = max(0, min(y1, frame_h - 1))
    x2 = max(x1 + 1, min(x2, frame_w))
    y2 = max(y1 + 1, min(y2, frame_h))
    return [x1, y1, x2, y2]


def _is_plate_fallback_vehicle_bbox(vehicle_bbox: list[int], plate_bbox: list[int]) -> bool:
    if vehicle_bbox == plate_bbox:
        return True
    vehicle_area = max(vehicle_bbox[2] - vehicle_bbox[0], 1) * max(vehicle_bbox[3] - vehicle_bbox[1], 1)
    plate_area = max(plate_bbox[2] - plate_bbox[0], 1) * max(plate_bbox[3] - plate_bbox[1], 1)
    if plate_area <= 0:
        return False
    return vehicle_area / plate_area < 1.35


def logo_zone_bbox(
    plate_bbox: list[int],
    frame_shape: tuple[int, ...],
    vehicle: dict[str, Any] | None = None,
) -> list[int] | None:
    """
    Crop the badge / grille area sitting above the plate bbox.
    Front and rear plates: emblem is typically just above the plate read.
    """
    if not plate_bbox or len(plate_bbox) < 4:
        return None

    px1, py1, px2, py2 = [int(v) for v in plate_bbox[:4]]
    pw = max(px2 - px1, 1)
    ph = max(py2 - py1, 1)
    frame_h, frame_w = frame_shape[:2]

    pad_x = max(int(pw * 0.72), 28)
    zone_h = max(int(ph * 4.2), 56)

    x1 = px1 - pad_x
    x2 = px2 + pad_x
    y2 = py1
    y1 = py1 - zone_h

    vehicle_bbox = (vehicle or {}).get("bbox")
    if isinstance(vehicle_bbox, (list, tuple)) and len(vehicle_bbox) >= 4:
        vehicle_box = [int(v) for v in vehicle_bbox[:4]]
        if not _is_plate_fallback_vehicle_bbox(vehicle_box, [px1, py1, px2, py2]):
            vx1, vy1, vx2, vy2 = vehicle_box
            x1 = max(x1, vx1)
            x2 = min(x2, vx2)
            y1 = max(y1, vy1)
            y2 = min(y2, vy2)

    bbox = _clamp_bbox([x1, y1, x2, y2], frame_w, frame_h)
    if bbox[2] - bbox[0] < 20 or bbox[3] - bbox[1] < 20:
        return None
    return bbox


def crop_logo_zone(
    frame,
    plate_bbox: list[int],
    vehicle: dict[str, Any] | None = None,
):
    bbox = logo_zone_bbox(plate_bbox, frame.shape, vehicle)
    if not bbox:
        return None, None
    x1, y1, x2, y2 = bbox
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None, None
    return crop, bbox


def _center_slice(crop: np.ndarray, top_fraction: float, width_fraction: float) -> np.ndarray | None:
    height, width = crop.shape[:2]
    top = max(int(height * top_fraction), 10)
    mid_w = max(int(width * width_fraction), 10)
    cx = width // 2
    x1 = max(0, cx - mid_w // 2)
    x2 = min(width, cx + mid_w // 2)
    if top < 10 or x2 - x1 < 10:
        return None
    return crop[0:top, x1:x2]


def badge_focus_crops(zone_bgr: np.ndarray) -> list[np.ndarray]:
    """
    Hood badges sit in the upper-centre of the zone above the plate.
    Return multiple tight views for robust logo matching.
    """
    if zone_bgr is None or zone_bgr.size == 0:
        return []

    views: list[np.ndarray] = []
    seen: set[tuple[int, int]] = set()

    def add(view: np.ndarray | None) -> None:
        if view is None or view.size == 0:
            return
        if view.shape[0] < 10 or view.shape[1] < 10:
            return
        key = (view.shape[0], view.shape[1])
        if key in seen and len(views) >= 3:
            return
        seen.add(key)
        views.append(view)

    add(_center_slice(zone_bgr, 0.30, 0.34))
    add(_center_slice(zone_bgr, 0.40, 0.50))
    add(_center_slice(zone_bgr, 0.55, 0.72))
    add(zone_bgr)
    return views


def emblem_crops(zone_bgr: np.ndarray) -> list[np.ndarray]:
    """Try to isolate circular hood badges via Hough circles."""
    if zone_bgr is None or zone_bgr.size == 0:
        return []

    badge = _center_slice(zone_bgr, 0.45, 0.55)
    if badge is None:
        return []

    gray = cv2.cvtColor(badge, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    height = gray.shape[0]
    min_radius = max(8, height // 12)
    max_radius = max(min_radius + 4, height // 3)

    circles = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.1,
        minDist=max(height // 4, 20),
        param1=120,
        param2=28,
        minRadius=min_radius,
        maxRadius=max_radius,
    )
    if circles is None:
        return []

    crops: list[np.ndarray] = []
    for cx, cy, radius in np.round(circles[0, :3]).astype(int):
        pad = int(radius * 1.2)
        x1 = max(0, cx - pad)
        x2 = min(badge.shape[1], cx + pad)
        y1 = max(0, cy - pad)
        y2 = min(badge.shape[0], cy + pad)
        if x2 - x1 < 12 or y2 - y1 < 12:
            continue
        crops.append(badge[y1:y2, x1:x2])
    return crops[:3]
