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

__all__ = ["apply_vehicle_color", "detect_color_from_frame", "reset_color_history"]


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
            result = detect_color_on_crop(dashboard, track_id)

        if not result:
            result = detect_color_from_frame(frame, vehicle_hint, anchor_bbox, track_id)
    except Exception as exc:
        logger.debug("Vehicle colour detection failed: %s", exc)
        result = None

    if not result:
        record["vehicle_color"] = None
        return record

    vehicle_payload = dict(vehicle_hint) if vehicle_hint else {}
    vehicle_payload["color"] = result["color"]
    vehicle_payload["color_confidence"] = result["confidence"]
    if result.get("vehicle_bbox"):
        vehicle_payload["color_bbox"] = result["vehicle_bbox"]
    record["vehicle"] = vehicle_payload
    record["vehicle_color"] = result["color"]
    return record
