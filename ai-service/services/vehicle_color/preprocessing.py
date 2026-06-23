"""Frame and crop preprocessing for colour analysis."""

from __future__ import annotations

import cv2
import numpy as np

from services.vehicle_color.config import CONFIG


def normalize_crop(crop_bgr: np.ndarray) -> np.ndarray:
    if crop_bgr.size == 0:
        return crop_bgr

    lab = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=CONFIG.clahe_clip, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_channel)
    normalized = cv2.merge([l_eq, a_channel, b_channel])
    balanced = cv2.cvtColor(normalized, cv2.COLOR_LAB2BGR)

    return cv2.bilateralFilter(
        balanced,
        CONFIG.bilateral_d,
        CONFIG.bilateral_sigma,
        CONFIG.bilateral_sigma,
    )
