"""Facade — colour detection only. Plate pipeline imports apply_vehicle_color from here."""

from services.vehicle_color import (
    apply_vehicle_color,
    detect_color_from_frame,
    enrich_records_color_from_snapshot,
    refresh_color_from_snapshot,
    reset_color_history,
)

__all__ = [
    "apply_vehicle_color",
    "detect_color_from_frame",
    "enrich_records_color_from_snapshot",
    "refresh_color_from_snapshot",
    "reset_color_history",
]
