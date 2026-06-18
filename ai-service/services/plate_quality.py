from typing import Any

from services.batch_context import is_video_mode
from services.plate_format import _strip_noise, is_indian_plate, is_indian_plate_partial, is_valid_plate

MIN_PLATE_CHARS = 5
MAX_PLATE_CHARS = 10
MIN_OCR_CONFIDENCE = 0.72
MIN_PLATE_WIDTH = 100
MIN_PLATE_HEIGHT = 22
MIN_PLATE_AREA = 1800
MAX_FRAME_AREA_RATIO = 0.22
MIN_ASPECT_RATIO = 2.5
MAX_ASPECT_RATIO = 9.0


def plate_key(text: str) -> str:
    return _strip_noise(text).upper()


def is_simple_plate_text(text: str) -> bool:
    """Accept compact alphanumeric OCR reads without layout guessing."""
    compact = plate_key(text)
    return MIN_PLATE_CHARS <= len(compact) <= MAX_PLATE_CHARS and compact.isalnum()


def is_plate_like(text: str) -> bool:
    """Plate shape check: Indian BH-series, EU/US mixed, or 5-8 char vanity (e.g. ADVNTXR)."""
    cleaned = plate_key(text)
    if len(cleaned) < MIN_PLATE_CHARS or len(cleaned) > MAX_PLATE_CHARS:
        return False

    if is_indian_plate(cleaned) or is_indian_plate_partial(cleaned):
        return True

    if len(cleaned) <= 8 and is_valid_plate(cleaned):
        return True

    if len(cleaned) > 8:
        return False

    letters = sum(1 for char in cleaned if char.isalpha())
    digits = sum(1 for char in cleaned if char.isdigit())
    if letters >= 3 and letters + digits == len(cleaned):
        return True

    return letters >= 2 and digits >= 2


def levenshtein_distance(left: str, right: str, max_distance: int = 2) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    if abs(len(left) - len(right)) > max_distance:
        return max_distance + 1

    previous_row = list(range(len(right) + 1))
    for i, char_left in enumerate(left, start=1):
        current_row = [i]
        row_min = i
        for j, char_right in enumerate(right, start=1):
            cell = min(
                current_row[j - 1] + 1,
                previous_row[j] + 1,
                previous_row[j - 1] + (char_left != char_right),
            )
            current_row.append(cell)
            row_min = min(row_min, cell)
        if row_min > max_distance:
            return max_distance + 1
        previous_row = current_row

    return previous_row[-1]


def plates_are_similar(left: str, right: str) -> bool:
    """Merge duplicate OCR variants of the same physical plate (Levenshtein-based)."""
    a = plate_key(left)
    b = plate_key(right)
    if not a or not b:
        return False
    if a == b:
        return True

    shorter, longer = sorted((a, b), key=len)
    if shorter in longer and len(shorter) >= MIN_PLATE_CHARS:
        return True

    if abs(len(a) - len(b)) > 2:
        return False

    max_distance = 2 if max(len(a), len(b)) >= 9 else (1 if max(len(a), len(b)) <= 6 else 2)
    return levenshtein_distance(a, b, max_distance=max_distance) <= max_distance


def _bbox_limits(frame_shape: tuple[int, ...]) -> dict[str, float]:
    frame_h, frame_w = frame_shape[:2]
    return {
        "min_width": max(52.0, frame_w * 0.011),
        "min_height": max(14.0, frame_h * 0.007),
        "min_area": max(650.0, frame_w * frame_h * 0.00005),
        "max_area_ratio": 0.28,
    }


def is_plate_bbox_valid(bbox: list[int], frame_shape: tuple[int, ...]) -> bool:
    if not bbox or len(bbox) < 4:
        return False

    limits = _bbox_limits(frame_shape)
    x1, y1, x2, y2 = bbox
    width = max(x2 - x1, 1)
    height = max(y2 - y1, 1)
    area = width * height

    if width < limits["min_width"] or height < limits["min_height"]:
        return False
    if area < limits["min_area"]:
        return False

    aspect = width / height
    if aspect < MIN_ASPECT_RATIO or aspect > MAX_ASPECT_RATIO:
        return False

    frame_h, frame_w = frame_shape[:2]
    frame_area = max(frame_w * frame_h, 1)
    if area / frame_area > limits["max_area_ratio"]:
        return False

    return True


def is_likely_half_plate(bbox: list[int], frame_shape: tuple[int, ...] | None = None) -> bool:
    if not bbox or len(bbox) < 4:
        return True

    x1, y1, x2, y2 = bbox
    width = max(x2 - x1, 1)
    height = max(y2 - y1, 1)
    min_width = 70.0
    min_height = 16.0
    if frame_shape:
        frame_h, frame_w = frame_shape[:2]
        min_width = max(40.0, frame_w * 0.010)
        min_height = max(12.0, frame_h * 0.035)

    if width < min_width or height < min_height:
        return True
    if width / max(height, 1) > 8.5:
        return True
    return False


def should_accept_detection(
    ocr: dict[str, Any],
    bbox: list[int],
    frame_shape: tuple[int, ...],
    min_confidence: float = MIN_OCR_CONFIDENCE,
) -> bool:
    text = plate_key(str(ocr.get("cleaned_text", "")))

    if not is_plate_like(text):
        return False
    if float(ocr.get("confidence", 0)) < min_confidence:
        return False
    if not is_plate_bbox_valid(bbox, frame_shape):
        return False

    confidence = float(ocr.get("confidence", 0))

    # Valid Indian plates on low-res listing photos often have small bboxes but high OCR confidence.
    if is_indian_plate(text) and confidence >= min_confidence:
        return True

    # BH-series reads missing the last digit (e.g. MH20TC744) are still usable on clear photos.
    if is_indian_plate_partial(text) and confidence >= max(0.68, min_confidence - 0.08):
        return True

    if is_likely_half_plate(bbox, frame_shape):
        return False

    return True


def detection_score(ocr: dict[str, Any], bbox: list[int]) -> float:
    x1, y1, x2, y2 = bbox
    width = max(x2 - x1, 1)
    area = max(width * max(y2 - y1, 1), 1)
    text = plate_key(str(ocr.get("cleaned_text", "")))
    text_len = len(text)
    length_weight = -8.0 if is_video_mode() else 12.0
    return float(ocr.get("confidence", 0)) * 1000 + area * 0.03 + width * 0.15 + text_len * length_weight
