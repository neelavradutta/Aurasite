"""
Vehicle colour detection — fully separate from plate detection/OCR.

Public entry: apply_vehicle_color(record, frame)
"""

from __future__ import annotations

import logging
from typing import Any

from services.vehicle_color.pipeline import detect_color_from_frame, detect_color_on_crop
from services.vehicle_color.snapshot import decode_dashboard_snapshot
from services.vehicle_color.tracking import reset_color_history

logger = logging.getLogger(__name__)

__all__ = [
    "apply_vehicle_color",
    "detect_color_from_frame",
    "enrich_records_color_from_snapshot",
    "refresh_color_from_snapshot",
    "reset_color_history",
]


def _attach_color_result(record: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    vehicle_hint = record.get("vehicle") if isinstance(record.get("vehicle"), dict) else None
    vehicle_payload = dict(vehicle_hint) if vehicle_hint else {}
    vehicle_payload["color"] = result["color"]
    vehicle_payload["color_confidence"] = result["confidence"]
    if result.get("vehicle_bbox"):
        vehicle_payload["color_bbox"] = result["vehicle_bbox"]
    record["vehicle"] = vehicle_payload
    record["vehicle_color"] = result["color"]
    return record


def refresh_color_from_snapshot(record: dict[str, Any]) -> dict[str, Any]:
    """Re-run colour from dashboard JPEG only (no full frame required)."""
    if not record or record.get("detection_quality") == "invalid":
        return record

    dashboard = decode_dashboard_snapshot(record)
    if dashboard is None:
        return record

    try:
        result = detect_color_on_crop(dashboard, track_id=None, snapshot_mode=True)
    except Exception as exc:
        logger.debug("Snapshot colour refresh failed: %s", exc)
        result = None

    if not result:
        return record

    return _attach_color_result(record, result)


def enrich_records_color_from_snapshot(records: list[dict[str, Any]]) -> None:
    for record in records:
        refresh_color_from_snapshot(record)


def apply_vehicle_color(record: dict[str, Any], frame: np.ndarray) -> dict[str, Any]:
    """Attach colour metadata to an existing detection record without changing plate fields."""
    if not record or record.get("detection_quality") == "invalid":
        return record

    vehicle_hint = record.get("vehicle") if isinstance(record.get("vehicle"), dict) else None
    anchor = record.get("plate_bbox")
    anchor_bbox = [int(v) for v in anchor[:4]] if isinstance(anchor, (list, tuple)) and len(anchor) >= 4 else None
    track_id = str(record["track_id"]) if record.get("track_id") else None

    result = None
    try:
        dashboard = decode_dashboard_snapshot(record)
        if dashboard is not None:
            result = detect_color_on_crop(dashboard, track_id, snapshot_mode=True)

        if not result:
            result = detect_color_from_frame(frame, vehicle_hint, anchor_bbox, track_id)
    except Exception as exc:
        logger.debug("Vehicle colour detection failed: %s", exc)
        result = None

    if not result:
        record["vehicle_color"] = None
        return record

    return _attach_color_result(record, result)
