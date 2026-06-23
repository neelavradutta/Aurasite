"""Tunable parameters for vehicle colour detection (independent of plate pipeline)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ColorDetectionConfig:
    min_confidence: float = 0.42
    min_vehicle_area: int = 1400
    max_area_ratio: float = 0.80
    horizontal_pad: float = 0.12
    vertical_pad_top: float = 0.05
    vertical_pad_bottom: float = 0.20
    body_inset_x: float = 0.10
    body_inset_top: float = 0.18
    body_inset_bottom: float = 0.32
    clahe_clip: float = 2.0
    bilateral_d: int = 7
    bilateral_sigma: int = 50
    kmeans_k: int = 4
    kmeans_iterations: int = 15
    max_pixels: int = 5000
    min_paint_pixels: int = 28
    cluster_weight_threshold: float = 0.20
    temporal_buffer_size: int = 8
    outlier_hue_delta: float = 30.0
    yolo_confidence: float = 0.35
    yolo_confidence_fallback: float = 0.22


CONFIG = ColorDetectionConfig()

ALLOWED_COLORS = ("White", "Silver", "Grey", "Black", "Red", "Blue", "Green", "Brown")
