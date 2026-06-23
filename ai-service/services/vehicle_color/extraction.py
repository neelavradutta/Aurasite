"""K-means (LAB) + histogram (HSV) dominant colour extraction."""

from __future__ import annotations

import cv2
import numpy as np

from services.vehicle_color.classification import classify_centroid, classify_from_hsv
from services.vehicle_color.config import CONFIG


def _sample_pixels(lab: np.ndarray, hsv: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    flat_lab = lab.reshape(-1, 3).astype(np.float32)
    flat_hsv = hsv.reshape(-1, 3).astype(np.float32)
    valid = mask.reshape(-1)
    pixels_lab = flat_lab[valid]
    pixels_hsv = flat_hsv[valid]
    if pixels_lab.shape[0] > CONFIG.max_pixels:
        idx = np.random.choice(pixels_lab.shape[0], CONFIG.max_pixels, replace=False)
        pixels_lab = pixels_lab[idx]
        pixels_hsv = pixels_hsv[idx]
    return pixels_lab, pixels_hsv


def _cluster_tightness(pixels: np.ndarray, centroid: np.ndarray) -> float:
    if pixels.shape[0] < 2:
        return 1.0
    distances = np.linalg.norm(pixels - centroid, axis=1)
    spread = float(np.std(distances))
    return max(0.0, 1.0 - spread / 45.0)


def kmeans_dominant(lab_pixels: np.ndarray, hsv_pixels: np.ndarray) -> tuple[str, float, float] | None:
    if lab_pixels.shape[0] < CONFIG.min_paint_pixels:
        return None

    k = min(CONFIG.kmeans_k, lab_pixels.shape[0])
    criteria = (
        cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER,
        CONFIG.kmeans_iterations,
        0.4,
    )
    _, labels, centers = cv2.kmeans(
        lab_pixels.astype(np.float32),
        k,
        None,
        criteria,
        3,
        cv2.KMEANS_PP_CENTERS,
    )

    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(counts)[::-1]

    for cluster_idx in order:
        count = int(counts[cluster_idx])
        weight = count / float(lab_pixels.shape[0])
        if weight < CONFIG.cluster_weight_threshold:
            continue

        cluster_lab = lab_pixels[labels.flatten() == cluster_idx]
        cluster_hsv = hsv_pixels[labels.flatten() == cluster_idx]
        lab_centroid = centers[cluster_idx]
        hsv_centroid = np.median(cluster_hsv, axis=0)

        name, hue_score = classify_centroid(lab_centroid, hsv_centroid)
        tightness = _cluster_tightness(cluster_lab, lab_centroid)
        saturation = float(np.median(cluster_hsv[:, 1]))
        sat_clarity = min(1.0, saturation / 100.0)
        confidence = 0.5 * weight + 0.3 * tightness + 0.2 * sat_clarity
        confidence *= hue_score
        return name, float(confidence), weight

    return None


def histogram_dominant(hsv_pixels: np.ndarray) -> tuple[str, float, float] | None:
    if hsv_pixels.shape[0] < CONFIG.min_paint_pixels:
        return None

    hue = hsv_pixels[:, 0].astype(np.int32)
    hist = np.bincount(hue, minlength=180).astype(np.float32)
    hist = cv2.GaussianBlur(hist.reshape(1, -1), (1, 9), 2).flatten()

    peak = int(np.argmax(hist))
    peak_weight = float(hist[peak]) / float(np.sum(hist) + 1e-6)
    if peak_weight < CONFIG.cluster_weight_threshold:
        return None

    in_bin = hsv_pixels[np.abs(hsv_pixels[:, 0] - peak) <= 5]
    if in_bin.shape[0] < 8:
        in_bin = hsv_pixels

    med_h = float(np.median(in_bin[:, 0]))
    med_s = float(np.median(in_bin[:, 1]))
    med_v = float(np.median(in_bin[:, 2]))
    name, hue_score = classify_from_hsv(med_h, med_s, med_v)
    confidence = peak_weight * hue_score
    return name, float(confidence), peak_weight


def fuse_extractions(
    kmeans_result: tuple[str, float, float] | None,
    histogram_result: tuple[str, float, float] | None,
) -> tuple[str, float] | None:
    if kmeans_result and histogram_result:
        if kmeans_result[0] == histogram_result[0]:
            conf = min(1.0, (kmeans_result[1] + histogram_result[1]) / 1.6)
            return kmeans_result[0], conf
        if kmeans_result[1] >= histogram_result[1]:
            return kmeans_result[0], kmeans_result[1]
        return histogram_result[0], histogram_result[1]
    if kmeans_result:
        return kmeans_result[0], kmeans_result[1]
    if histogram_result:
        return histogram_result[0], histogram_result[1]
    return None
