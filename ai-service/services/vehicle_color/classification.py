"""Colour classification taxonomy (HSV + LAB)."""

from __future__ import annotations

import numpy as np

from services.vehicle_color.config import ALLOWED_COLORS


def classify_from_hsv(hue: float, saturation: float, value: float) -> tuple[str, float]:
    if saturation < 20:
        if value > 200:
            return "White", min(1.0, 0.55 + (value - 200) / 110)
        if value > 150:
            return "Silver", min(1.0, 0.5 + (value - 150) / 120)
        if value > 80:
            return "Grey", min(1.0, 0.48 + (value - 80) / 140)
        return "Black", min(1.0, 0.5 + (80 - value) / 90)

    clarity = min(1.0, saturation / 120.0)

    if hue < 8 or hue >= 168:
        return "Red", 0.5 + clarity * 0.5
    if hue < 25:
        return "Brown", 0.45 + clarity * 0.5
    if hue < 38:
        return "Brown", 0.42 + clarity * 0.5
    if hue < 85:
        return "Green", 0.48 + clarity * 0.5
    if hue < 130:
        return "Blue", 0.5 + clarity * 0.5
    return "Red", 0.45 + clarity * 0.5


def classify_centroid(lab_centroid: np.ndarray, hsv_centroid: np.ndarray) -> tuple[str, float]:
    hue, saturation, value = float(hsv_centroid[0]), float(hsv_centroid[1]), float(hsv_centroid[2])
    name, hue_score = classify_from_hsv(hue, saturation, value)

    chroma = float(np.sqrt((lab_centroid[1] - 128.0) ** 2 + (lab_centroid[2] - 128.0) ** 2))
    if chroma < 14 and saturation < 28:
        lightness = float(lab_centroid[0])
        if lightness >= 205:
            return "White", hue_score
        if lightness >= 158:
            return "Silver", hue_score
        if lightness >= 92:
            return "Grey", hue_score
        return "Black", hue_score

    return name, hue_score


def is_allowed_color(name: str) -> bool:
    return name in ALLOWED_COLORS
