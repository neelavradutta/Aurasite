"""Vehicle brand / logo detection — crops above the plate and matches reference logos."""

from __future__ import annotations

import base64
import logging
from typing import Any

import cv2
import numpy as np

from services.plate_quality import plate_key, plates_are_similar
from services.vehicle_brand.matching import match_brand_logo
from services.vehicle_brand.roi import crop_logo_zone

logger = logging.getLogger(__name__)

__all__ = [
    "apply_vehicle_brand",
    "enrich_records_brand_from_frame",
    "enrich_records_brand_from_pool",
    "encode_logo_snapshot",
]


def encode_logo_snapshot(crop: np.ndarray) -> str | None:
    if crop is None or crop.size == 0:
        return None
    h, w = crop.shape[:2]
    max_side = 480
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buffer = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        return None
    return base64.b64encode(buffer).decode("ascii")


def _attach_brand_result(
    record: dict[str, Any],
    brand: str,
    confidence: float,
    logo_bbox: list[int] | None,
    logo_snapshot: str | None,
) -> dict[str, Any]:
    vehicle_hint = record.get("vehicle") if isinstance(record.get("vehicle"), dict) else {}
    vehicle_payload = dict(vehicle_hint)
    vehicle_payload["brand"] = brand
    vehicle_payload["brand_confidence"] = confidence
    if logo_bbox:
        vehicle_payload["logo_bbox"] = logo_bbox
    record["vehicle"] = vehicle_payload
    record["vehicle_brand"] = brand
    record["vehicle_brand_confidence"] = confidence
    record["model"] = brand
    if logo_snapshot:
        record["logo_image_base64"] = logo_snapshot
    return record


def apply_vehicle_brand(record: dict[str, Any], frame: np.ndarray) -> dict[str, Any]:
    """Detect brand from the grille/badge zone above the plate."""
    if not record or record.get("detection_quality") == "invalid":
        return record
    if record.get("detection_quality") not in {"accepted", "partial"}:
        return record

    plate_bbox = record.get("plate_bbox")
    if not isinstance(plate_bbox, (list, tuple)) or len(plate_bbox) < 4:
        return record

    vehicle_hint = record.get("vehicle") if isinstance(record.get("vehicle"), dict) else None
    crop, logo_bbox = crop_logo_zone(frame, [int(v) for v in plate_bbox[:4]], vehicle_hint)
    if crop is None:
        return record

    logo_snapshot = encode_logo_snapshot(crop)
    match = match_brand_logo(crop)
    if not match:
        if logo_snapshot:
            record["logo_image_base64"] = logo_snapshot
        if logo_bbox:
            record["logo_bbox"] = logo_bbox
        return record

    return _attach_brand_result(
        record,
        str(match["brand"]),
        float(match["confidence"]),
        logo_bbox,
        logo_snapshot,
    )


def enrich_records_brand_from_frame(records: list[dict[str, Any]], frame: np.ndarray) -> None:
    for record in records:
        if record.get("vehicle_brand"):
            continue
        apply_vehicle_brand(record, frame)


def enrich_records_brand_from_pool(
    targets: list[dict[str, Any]],
    pool: list[dict[str, Any]],
) -> None:
    """Pick the best brand read across all frames for each consolidated plate."""
    for target in targets:
        if target.get("vehicle_brand"):
            continue

        target_plate = plate_key(str(target.get("plate_number", "")))
        if not target_plate:
            continue

        best_name: str | None = None
        best_conf = -1.0
        for item in pool:
            item_plate = plate_key(str(item.get("plate_number", "")))
            if item_plate != target_plate and not plates_are_similar(item_plate, target_plate):
                continue
            brand = item.get("vehicle_brand")
            if not brand:
                continue
            conf = float(item.get("vehicle_brand_confidence", 0))
            if conf > best_conf:
                best_conf = conf
                best_name = str(brand)

        if best_name:
            _attach_brand_result(target, best_name, best_conf, None, None)
