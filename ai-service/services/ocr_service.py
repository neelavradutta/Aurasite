import logging
import os
from typing import Any

import cv2
import numpy as np

from config.settings import settings
from services.plate_format import is_indian_plate, is_indian_plate_partial, normalize_plate_text
from services.plate_quality import MIN_PLATE_CHARS, plate_key
from services.model_registry import ModelStatus, resolve_device
from services.batch_context import is_image_mode, is_live_mode, is_video_mode
from services.video_plate_processing import refine_video_plate_read

logger = logging.getLogger(__name__)

_ocr_engine: Any = None
_ocr_status = ModelStatus("paddleocr", False, "cpu", "not loaded")


def _paddle_use_gpu() -> bool:
    """Paddle GPU + PyTorch CUDA conflict in one process on Windows — YOLO uses GPU, OCR stays CPU."""
    if resolve_device() != "cuda":
        return False
    import sys

    return sys.platform != "win32"


def _create_paddle_ocr():
    os.environ.setdefault("FLAGS_use_mkldnn", "0")

    from paddleocr import PaddleOCR

    use_gpu = _paddle_use_gpu()
    lang = settings.ocr_lang

    try:
        return PaddleOCR(use_angle_cls=True, lang=lang, use_gpu=use_gpu, show_log=False)
    except TypeError:
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
            lang=lang,
        )


def load_ocr(force: bool = False):
    global _ocr_engine, _ocr_status

    if _ocr_engine is not None and not force:
        return _ocr_engine

    device = "gpu" if _paddle_use_gpu() else "cpu"
    try:
        _ocr_engine = _create_paddle_ocr()
        _ocr_status = ModelStatus("paddleocr", True, device, f"PaddleOCR {settings.ocr_lang}")
        logger.info("PaddleOCR loaded (device=%s)", device)
    except Exception as exc:
        _ocr_engine = None
        _ocr_status = ModelStatus("paddleocr", False, device, str(exc))
        raise RuntimeError(f"PaddleOCR failed to load: {exc}") from exc

    return _ocr_engine


def get_ocr_model_status() -> ModelStatus:
    if _ocr_engine is None:
        load_ocr()
    return _ocr_status


def _parse_ocr_result(result: Any) -> tuple[list[str], list[float]]:
    texts: list[str] = []
    confidences: list[float] = []

    if not result:
        return texts, confidences

    if isinstance(result, list) and result and isinstance(result[0], list):
        lines = result[0] if result[0] and isinstance(result[0][0], (list, tuple)) else result
        for line in lines:
            if len(line) >= 2 and isinstance(line[1], (list, tuple)):
                texts.append(str(line[1][0]))
                confidences.append(float(line[1][1]))
        return texts, confidences

    if isinstance(result, list) and result and isinstance(result[0], dict):
        item = result[0]
        rec_texts = item.get("rec_texts") or item.get("rec_text") or []
        rec_scores = item.get("rec_scores") or item.get("rec_score") or []
        if isinstance(rec_texts, str):
            rec_texts = [rec_texts]
        texts.extend(str(t) for t in rec_texts)
        confidences.extend(float(s) for s in rec_scores)
        return texts, confidences

    return texts, confidences


def preprocess_plate_crop(plate_crop: np.ndarray) -> np.ndarray:
    if plate_crop.size == 0:
        return plate_crop
    gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.bilateralFilter(enhanced, 9, 75, 75)
    return cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)


def sharpen_plate_crop(plate_crop: np.ndarray) -> np.ndarray:
    if plate_crop.size == 0:
        return plate_crop
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    return cv2.filter2D(plate_crop, -1, kernel)


def emphasize_stroke_plate_crop(plate_crop: np.ndarray) -> np.ndarray:
    """Sharpen character strokes to separate similar glyphs like 8 and S."""
    if plate_crop.size == 0:
        return plate_crop
    gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    emphasized = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)
    emphasized = cv2.addWeighted(gray, 0.82, emphasized, 0.55, 0)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    emphasized = clahe.apply(emphasized)
    return cv2.cvtColor(emphasized, cv2.COLOR_GRAY2BGR)


def adaptive_plate_crop(plate_crop: np.ndarray) -> np.ndarray:
    if plate_crop.size == 0:
        return plate_crop
    gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def crop_bbox(frame: np.ndarray, bbox: list[int], pad: float = 0.05) -> np.ndarray:
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]
    bw, bh = x2 - x1, y2 - y1
    x1 = max(0, int(x1 - bw * pad))
    y1 = max(0, int(y1 - bh * pad))
    x2 = min(w, int(x2 + bw * pad))
    y2 = min(h, int(y2 + bh * pad))
    return frame[y1:y2, x1:x2]


def crop_bbox_video(frame: np.ndarray, bbox: list[int], pad_x: float = 0.18, pad_y: float = 0.14) -> np.ndarray:
    """Extra horizontal padding helps capture trailing plate digits in motion frames."""
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]
    bw, bh = x2 - x1, y2 - y1
    x1 = max(0, int(x1 - bw * pad_x))
    y1 = max(0, int(y1 - bh * pad_y))
    x2 = min(w, int(x2 + bw * pad_x * 1.35))
    y2 = min(h, int(y2 + bh * pad_y))
    return frame[y1:y2, x1:x2]


def upscale_for_ocr(plate_crop: np.ndarray) -> np.ndarray:
    if plate_crop.size == 0:
        return plate_crop
    h, w = plate_crop.shape[:2]
    if h >= 48 and w >= 140:
        return plate_crop
    scale = max(48 / max(h, 1), 140 / max(w, 1), 2.0)
    return cv2.resize(plate_crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def prepare_snapshot_crop(plate_crop: np.ndarray) -> np.ndarray:
    if plate_crop.size == 0:
        return plate_crop
    enhanced = preprocess_plate_crop(plate_crop)
    return upscale_for_ocr(enhanced)


def extract_plate_region_from_vehicle(frame: np.ndarray, vehicle_bbox: list[int]) -> np.ndarray:
    x1, y1, x2, y2 = vehicle_bbox
    vehicle_h = y2 - y1
    plate_y1 = y1 + int(vehicle_h * 0.55)
    return frame[plate_y1:y2, x1:x2]


def _run_ocr_on_crop(ocr: Any, plate_crop: np.ndarray) -> tuple[list[str], list[float]]:
    if plate_crop.size == 0:
        return [], []

    processed = upscale_for_ocr(plate_crop)
    try:
        if hasattr(ocr, "ocr"):
            result = ocr.ocr(processed, cls=True)
        else:
            result = ocr.predict(processed)
    except Exception as exc:
        logger.warning("OCR inference failed: %s", exc)
        return [], []

    return _parse_ocr_result(result)


def _select_ocr_text(texts: list[str], confidences: list[float]) -> tuple[str, float]:
    """Pick one OCR line. Prefer shortest high-confidence read — joined lines add false chars."""
    if not texts:
        return "", 0.0

    if len(texts) == 1:
        conf = float(confidences[0]) if confidences else 0.5
        return texts[0], conf

    pairs = [
        (text, float(confidences[idx]) if idx < len(confidences) else 0.5)
        for idx, text in enumerate(texts)
    ]
    max_conf = max(conf for _, conf in pairs)
    shortlist = [pair for pair in pairs if pair[1] >= max_conf - 0.08]
    viable = [pair for pair in shortlist if len(plate_key(pair[0])) >= MIN_PLATE_CHARS]
    if viable:
        shortlist = viable
    best_text, best_conf = min(shortlist, key=lambda pair: (len(plate_key(pair[0])), -pair[1]))
    return best_text, best_conf


def _image_ocr_text_candidates(texts: list[str], confidences: list[float]) -> list[tuple[str, float]]:
    """Image OCR often reads dealer/watermark text too; score each line before joining."""
    pairs = [
        (str(text), float(confidences[idx]) if idx < len(confidences) else 0.5)
        for idx, text in enumerate(texts)
        if str(text).strip()
    ]
    if not pairs:
        return []

    candidates: list[tuple[str, float]] = pairs[:]
    if len(pairs) > 1:
        joined = " ".join(text for text, _ in pairs)
        avg_conf = sum(conf for _, conf in pairs) / len(pairs)
        candidates.append((joined, avg_conf))

        for start in range(len(pairs)):
            for end in range(start + 2, min(len(pairs), start + 3) + 1):
                chunk = pairs[start:end]
                text = " ".join(item[0] for item in chunk)
                conf = sum(item[1] for item in chunk) / len(chunk)
                candidates.append((text, conf))

    seen: set[str] = set()
    unique: list[tuple[str, float]] = []
    for text, confidence in candidates:
        key = plate_key(text)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append((text, confidence))
    return unique


def _video_candidate_rank(candidate: dict[str, Any]) -> tuple[float, int]:
    text = plate_key(str(candidate.get("cleaned_text", "")))
    confidence = float(candidate.get("confidence", 0))
    return (-confidence, len(text))


def _normalize_ocr_text(raw_text: str, confidence: float) -> dict[str, Any]:
    if is_video_mode():
        return refine_video_plate_read(raw_text, confidence=confidence)
    return normalize_plate_text(raw_text, confidence=confidence)


def recognize_plate_crop(plate_crop: np.ndarray, frame_id: int = 0) -> dict[str, Any]:
    ocr = load_ocr()

    if plate_crop.size == 0:
        return normalize_plate_text("UNKNOWN", confidence=0.0)

    variants = (
        [plate_crop, preprocess_plate_crop(plate_crop)]
        if is_live_mode()
        else [
            plate_crop,
            preprocess_plate_crop(plate_crop),
            sharpen_plate_crop(preprocess_plate_crop(plate_crop)),
            emphasize_stroke_plate_crop(plate_crop),
            adaptive_plate_crop(plate_crop),
        ]
    )

    best: dict[str, Any] | None = None
    best_video_rank: tuple[float, int] | None = None
    best_score = -1.0
    fallback: dict[str, Any] | None = None
    fallback_video_rank: tuple[float, int] | None = None
    fallback_score = -1.0
    min_conf = settings.min_plate_confidence
    if is_live_mode():
        floor_conf = max(0.32, min_conf - 0.08)
    elif is_video_mode():
        floor_conf = max(0.58, min_conf - 0.14)
    else:
        floor_conf = max(0.62, min_conf - 0.1)

    for variant in variants:
        texts, confidences = _run_ocr_on_crop(ocr, variant)
        if not texts:
            continue

        if is_video_mode():
            raw_text, confidence = _select_ocr_text(texts, confidences)
            candidate = _normalize_ocr_text(raw_text, confidence=confidence)
            if candidate["cleaned_text"] in {"UNKNOWN", "UNREADABLE", "REJECTED"}:
                continue
            rank = _video_candidate_rank(candidate)
            if confidence >= min_conf and (best_video_rank is None or rank < best_video_rank):
                best = candidate
                best_video_rank = rank
            elif confidence >= floor_conf and (fallback_video_rank is None or rank < fallback_video_rank):
                fallback = candidate
                fallback_video_rank = rank
            continue

        for raw_text, confidence in _image_ocr_text_candidates(texts, confidences):
            candidate = _normalize_ocr_text(raw_text, confidence=confidence)
            if candidate["cleaned_text"] in {"UNKNOWN", "UNREADABLE", "REJECTED"}:
                continue

            text = plate_key(str(candidate.get("cleaned_text", "")))
            score = candidate["confidence"] + (1.5 if candidate["is_valid"] else 0.0) + 0.5
            if is_indian_plate(text):
                score += 1.2
            elif is_indian_plate_partial(text):
                score += 0.8

            if confidence >= min_conf and score > best_score:
                best = candidate
                best_score = score
                if is_live_mode() and candidate.get("is_valid"):
                    break
            elif confidence >= floor_conf and score > fallback_score:
                fallback = candidate
                fallback_score = score

    chosen = best or fallback
    if chosen is None:
        return normalize_plate_text("UNKNOWN", confidence=0.0)

    if confidences := chosen.get("char_confidences"):
        chosen["char_confidences"] = confidences
    return chosen


def _rank_ocr_candidate(candidate: dict[str, Any]) -> float:
    text = plate_key(str(candidate.get("cleaned_text", "")))
    if not text or text in {"UNKNOWN", "UNREADABLE", "REJECTED"}:
        return -1.0

    score = float(candidate.get("confidence", 0)) * 10.0
    if is_indian_plate(text):
        score += 30.0
    elif is_indian_plate_partial(text):
        score += 24.0
    if is_video_mode():
        score -= len(text) * 0.4
    else:
        score += len(text) * 0.6
    return score


def recognize_plate(frame: np.ndarray, plate_bbox: list[int], frame_id: int = 0) -> dict[str, Any]:
    if is_live_mode():
        crops = [crop_bbox(frame, plate_bbox, pad=0.12)]
    elif is_image_mode():
        crops = [crop_bbox(frame, plate_bbox, pad=pad) for pad in (0.15, 0.35)]
    elif is_video_mode():
        crops = [
            crop_bbox(frame, plate_bbox, pad=0.08),
            crop_bbox(frame, plate_bbox, pad=0.12),
            crop_bbox_video(frame, plate_bbox, pad_x=0.10, pad_y=0.10),
        ]
    else:
        crops = [crop_bbox(frame, plate_bbox, pad=0.15)]

    best: dict[str, Any] | None = None
    best_rank = -1.0

    for crop in crops:
        candidate = recognize_plate_crop(crop, frame_id)
        rank = _rank_ocr_candidate(candidate)
        if rank > best_rank:
            best_rank = rank
            best = candidate

    plate = best or normalize_plate_text("UNKNOWN", confidence=0.0)
    plate["plate_bbox"] = plate_bbox
    return plate


def recognize_plate_from_vehicle(frame: np.ndarray, vehicle_bbox: list[int], frame_id: int = 0) -> dict[str, Any]:
    crop = extract_plate_region_from_vehicle(frame, vehicle_bbox)
    return recognize_plate_crop(crop, frame_id)
