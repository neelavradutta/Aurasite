"""Match logo/badge crops against reference brand templates."""

from __future__ import annotations

import cv2
import numpy as np

from services.vehicle_brand.reference import load_brand_template_features
from services.vehicle_brand.roi import badge_focus_crops, emblem_crops

MATCH_SIZE = 160
MIN_INLIERS = 8
MIN_MARGIN_INLIERS = 2
MIN_INLIER_RATIO = 0.42

_ORB = cv2.ORB_create(nfeatures=1500, scaleFactor=1.2, nlevels=8, fastThreshold=6)
_MATCHER = cv2.BFMatcher(cv2.NORM_HAMMING)


def _prepare_gray(image: np.ndarray, size: int = MATCH_SIZE) -> np.ndarray:
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def _orb_inlier_score(
    query_kp,
    query_des,
    template_kp,
    template_des,
) -> tuple[int, int, float]:
    if query_des is None or template_des is None or len(query_kp) < 8 or len(template_kp) < 8:
        return 0, 0, 0.0

    pairs = _MATCHER.knnMatch(query_des, template_des, k=2)
    good: list[cv2.DMatch] = []
    for pair in pairs:
        if len(pair) < 2:
            continue
        first, second = pair
        if first.distance < 0.75 * second.distance:
            good.append(first)

    good_count = len(good)
    if good_count < 6:
        return good_count, 0, 0.0

    src = np.float32([query_kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([template_kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    inliers = int(mask.sum()) if mask is not None else 0
    ratio = inliers / max(good_count, 1)
    quality = inliers * ratio
    return good_count, inliers, quality


def _query_views(crop_bgr: np.ndarray) -> list[np.ndarray]:
    views: list[np.ndarray] = []
    seen: set[tuple[int, int]] = set()

    def add(view: np.ndarray | None) -> None:
        if view is None or view.size == 0 or view.shape[0] < 10 or view.shape[1] < 10:
            return
        key = (view.shape[0], view.shape[1])
        if key in seen:
            return
        seen.add(key)
        views.append(view)

    for view in emblem_crops(crop_bgr):
        add(view)
    for view in badge_focus_crops(crop_bgr):
        add(view)
    return views


def _score_brand(
    query_views: list[np.ndarray],
    template_features: dict[str, list[tuple[list, np.ndarray | None]]],
) -> list[tuple[str, int, int, float]]:
    brand_scores: dict[str, tuple[int, int, float]] = {}

    for name, variants in template_features.items():
        best_inliers = 0
        best_good = 0
        best_quality = 0.0

        for query in query_views:
            query_gray = _prepare_gray(query)
            query_kp, query_des = _ORB.detectAndCompute(query_gray, None)
            if query_des is None:
                continue

            for template_kp, template_des in variants:
                good, inliers, quality = _orb_inlier_score(
                    query_kp, query_des, template_kp, template_des
                )
                if inliers > best_inliers or (inliers == best_inliers and quality > best_quality):
                    best_inliers = inliers
                    best_good = good
                    best_quality = quality

        brand_scores[name] = (best_good, best_inliers, best_quality)

    ranked = [
        (name, good, inliers, quality)
        for name, (good, inliers, quality) in brand_scores.items()
    ]
    ranked.sort(key=lambda item: (item[2], item[3], item[1]), reverse=True)
    return ranked


def match_brand_logo(crop_bgr: np.ndarray) -> dict[str, float | str] | None:
    if crop_bgr is None or crop_bgr.size == 0:
        return None
    if crop_bgr.shape[0] < 12 or crop_bgr.shape[1] < 12:
        return None

    template_features = load_brand_template_features()
    if not template_features:
        return None

    query_views = _query_views(crop_bgr)
    if not query_views:
        return None

    ranked = _score_brand(query_views, template_features)
    if not ranked:
        return None

    emblem_seen = bool(emblem_crops(crop_bgr))
    skoda_row = next((row for row in ranked if row[0] == "Skoda Auto India"), None)

    best_name, best_good, best_inliers, best_quality = ranked[0]
    runner_inliers = ranked[1][2] if len(ranked) > 1 else 0
    inlier_ratio = best_inliers / max(best_good, 1)
    margin = best_inliers - runner_inliers

    accepted = (
        best_inliers >= MIN_INLIERS
        and inlier_ratio >= MIN_INLIER_RATIO
        and margin >= MIN_MARGIN_INLIERS
    )

    if (
        not accepted
        and emblem_seen
        and skoda_row
        and skoda_row[2] >= 8
        and skoda_row[2] / max(skoda_row[1], 1) >= 0.45
    ):
        best_name = "Skoda Auto India"
        best_inliers = skoda_row[2]
        best_good = skoda_row[1]
        inlier_ratio = best_inliers / max(best_good, 1)
        accepted = True

    if not accepted:
        return None

    confidence = min(0.98, 0.45 + best_inliers * 0.025 + inlier_ratio * 0.25)
    return {
        "brand": best_name,
        "confidence": round(confidence, 3),
    }
