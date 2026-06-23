"""ROI masks — mid-body focus, shadow and reflection rejection."""

from __future__ import annotations

import cv2
import numpy as np

from services.vehicle_color.config import CONFIG


def body_band_mask(shape: tuple[int, int]) -> np.ndarray:
    height, width = shape
    mask = np.zeros((height, width), dtype=np.uint8)
    x1 = int(width * CONFIG.body_inset_x)
    x2 = int(width * (1.0 - CONFIG.body_inset_x))
    y1 = int(height * CONFIG.body_inset_top)
    y2 = int(height * (1.0 - CONFIG.body_inset_bottom))
    if x2 > x1 and y2 > y1:
        mask[y1:y2, x1:x2] = 1
    return mask.astype(bool)


def paint_pixel_mask(lab: np.ndarray, hsv: np.ndarray, body_mask: np.ndarray) -> np.ndarray:
    flat_lab = lab.reshape(-1, 3).astype(np.float32)
    flat_hsv = hsv.reshape(-1, 3).astype(np.float32)

    lightness = flat_lab[:, 0]
    chroma = np.sqrt((flat_lab[:, 1] - 128.0) ** 2 + (flat_lab[:, 2] - 128.0) ** 2)
    hue = flat_hsv[:, 0]
    saturation = flat_hsv[:, 1]
    value = flat_hsv[:, 2]

    valid = body_mask.reshape(-1).copy()
    valid &= (value > 35) & (value < 252)
    valid &= ~((value < 80) & (saturation > 50))
    valid &= ~((value > 200) & (saturation < 20))
    valid &= ~((lightness > 210) & (chroma < 10))

    chromatic = saturation >= 30
    valid &= chromatic | (chroma < 18)

    if int(np.count_nonzero(valid)) < CONFIG.min_paint_pixels:
        valid = body_mask.reshape(-1) & (value > 25) & (value < 252)

    mask_2d = valid.reshape(lab.shape[:2])
    kernel = np.ones((3, 3), np.uint8)
    closed = cv2.morphologyEx(mask_2d.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    return closed.astype(bool)
