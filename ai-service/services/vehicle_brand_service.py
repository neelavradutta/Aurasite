"""Facade — brand/logo detection for image, video, and live pipelines."""

from services.vehicle_brand import (
    apply_vehicle_brand,
    enrich_records_brand_from_frame,
    enrich_records_brand_from_pool,
)

__all__ = [
    "apply_vehicle_brand",
    "enrich_records_brand_from_frame",
    "enrich_records_brand_from_pool",
]
