"""Load logo templates from the Indian vehicle brands reference sheet."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
MANIFEST_PATH = DATA_DIR / "indian_vehicle_brands.json"

_template_sets: dict[str, list[np.ndarray]] | None = None
_template_features: dict[str, list[tuple]] | None = None
_templates_flat: list[tuple[str, np.ndarray]] | None = None
_manifest: dict[str, Any] | None = None

_ORB = cv2.ORB_create(nfeatures=1500, scaleFactor=1.2, nlevels=8, fastThreshold=6)
_MATCH_SIZE = 160


def _prepare_template_gray(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    return cv2.resize(gray, (_MATCH_SIZE, _MATCH_SIZE), interpolation=cv2.INTER_AREA)


def _load_manifest() -> dict[str, Any]:
    global _manifest
    if _manifest is not None:
        return _manifest
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        _manifest = json.load(handle)
    return _manifest


def brand_names() -> list[str]:
    manifest = _load_manifest()
    names: list[str] = []
    for row in manifest.get("brands", []):
        for name in row:
            if name and name not in names:
                names.append(str(name))
    return names


def _cell_logo_crop(cell: np.ndarray, logo_fraction: float) -> np.ndarray:
    height = cell.shape[0]
    split = max(int(height * logo_fraction), 8)
    return cell[:split, :]


def _emblem_focus(logo_bgr: np.ndarray) -> np.ndarray:
    height, width = logo_bgr.shape[:2]
    y2 = max(int(height * 0.88), 8)
    x1 = int(width * 0.14)
    x2 = int(width * 0.86)
    if x2 <= x1 or y2 < 8:
        return logo_bgr
    return logo_bgr[0:y2, x1:x2]


def _tight_emblem(logo_bgr: np.ndarray) -> np.ndarray:
    height, width = logo_bgr.shape[:2]
    y2 = max(int(height * 0.72), 8)
    cx = width // 2
    half = max(int(width * 0.28), 6)
    x1 = max(0, cx - half)
    x2 = min(width, cx + half)
    if x2 <= x1 or y2 < 8:
        return logo_bgr
    return logo_bgr[0:y2, x1:x2]


def load_brand_template_sets(force: bool = False) -> dict[str, list[np.ndarray]]:
    global _template_sets, _templates_flat
    if _template_sets is not None and not force:
        return _template_sets

    manifest = _load_manifest()
    grid = manifest.get("grid", {})
    columns = int(grid.get("columns", 12))
    rows = int(grid.get("rows", 9))
    logo_fraction = float(grid.get("logo_height_fraction", 0.58))
    image_name = str(manifest.get("reference_image", "indian_vehicle_brands_reference.png"))
    image_path = DATA_DIR / image_name

    flat_names: list[str | None] = []
    for row in manifest.get("brands", []):
        flat_names.extend(row)
    while len(flat_names) < columns * rows:
        flat_names.append(None)

    if not image_path.is_file():
        logger.warning(
            "Brand reference image missing at %s — place the logo sheet there for brand matching",
            image_path,
        )
        _template_sets = {}
        _templates_flat = []
        return _template_sets

    sheet = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if sheet is None or sheet.size == 0:
        logger.warning("Could not read brand reference image: %s", image_path)
        _template_sets = {}
        _templates_flat = []
        return _template_sets

    sheet_h, sheet_w = sheet.shape[:2]
    cell_w = sheet_w // columns
    cell_h = sheet_h // rows
    template_sets: dict[str, list[np.ndarray]] = {}
    flat: list[tuple[str, np.ndarray]] = []

    for index, name in enumerate(flat_names[: columns * rows]):
        if not name:
            continue
        row = index // columns
        col = index % columns
        x1 = col * cell_w
        y1 = row * cell_h
        x2 = x1 + cell_w if col < columns - 1 else sheet_w
        y2 = y1 + cell_h if row < rows - 1 else sheet_h
        cell = sheet[y1:y2, x1:x2]
        if cell.size == 0:
            continue

        logo = _cell_logo_crop(cell, logo_fraction)
        if logo.shape[0] < 8 or logo.shape[1] < 8:
            continue

        variants = [logo, _emblem_focus(logo), _tight_emblem(logo)]
        unique_variants: list[np.ndarray] = []
        seen: set[tuple[int, int, int]] = set()
        for variant in variants:
            if variant.shape[0] < 8 or variant.shape[1] < 8:
                continue
            key = (variant.shape[0], variant.shape[1], int(variant.mean()))
            if key in seen:
                continue
            seen.add(key)
            unique_variants.append(variant)
            flat.append((str(name), variant))

        if unique_variants:
            brand = str(name)
            template_sets.setdefault(brand, []).extend(unique_variants)

    _template_sets = template_sets
    _templates_flat = flat
    logger.info(
        "Loaded %s brand names (%s template crops) from reference sheet",
        len(template_sets),
        len(flat),
    )
    return _template_sets


def load_brand_template_features(force: bool = False) -> dict[str, list[tuple]]:
    global _template_features
    if _template_features is not None and not force:
        return _template_features

    template_sets = load_brand_template_sets(force=force)
    features: dict[str, list[tuple]] = {}
    for name, templates in template_sets.items():
        variants: list[tuple] = []
        for template in templates:
            gray = _prepare_template_gray(template)
            keypoints, descriptors = _ORB.detectAndCompute(gray, None)
            variants.append((keypoints, descriptors))
        if variants:
            features[name] = variants

    _template_features = features
    return _template_features


def load_brand_templates(force: bool = False) -> list[tuple[str, np.ndarray]]:
    if _templates_flat is not None and not force:
        return _templates_flat
    load_brand_template_sets(force=force)
    return _templates_flat or []
