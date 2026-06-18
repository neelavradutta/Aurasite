"""Image-upload detection pipeline (separate from video batch processing)."""

from __future__ import annotations

import re
import time
from typing import Any, Callable

import numpy as np

from services import batch_context
from services.detection_service import detect_vehicles
from services.plate_detection_service import detect_plates
from services.plate_extractor import encode_full_frame_snapshot, extract_plate_record
from services.ocr_service import recognize_plate
from services.plate_format import is_indian_plate, is_indian_plate_partial
from services.plate_quality import (
    is_plate_bbox_valid,
    is_plate_like,
    plate_key,
    plates_are_similar,
    should_accept_detection,
)

ProgressCallback = Callable[[int, int], None]

IMAGE_TARGET_LONGEST_SIDE = 1800
IMAGE_MAX_UPSCALE = 2.5
IMAGE_PLATE_CONFIDENCE = 0.12
MAX_IMAGE_PLATE_CANDIDATES = 12
MAX_CONTEXT_OCR_BOXES = 2
MAX_IMAGE_VEHICLE_CANDIDATES = 4
MAX_IMAGE_PLATE_FRAME_AREA_RATIO = 0.14

CHINESE_STYLE_PLATE = re.compile(r"^[A-Z]\d{5,6}$")
US_PLATE_NEAR = re.compile(r"^[A-Z0-9]{3}\d{4}$")

WATERMARK_MARKERS = (
    "ALAMY",
    "SHUTTERSTOCK",
    "SHUTTER",
    "GETTY",
    "ISTOCK",
    "DREAMSTIME",
    "WATERMARK",
    "ADOBE",
)

# Digits misread in US/EU letter positions (e.g. B9K4086 -> BBK4086).
LETTER_SLOT_FIX = str.maketrans({"0": "O", "1": "I", "8": "B", "9": "B", "5": "S", "6": "G", "2": "Z"})

FALSE_KA_EU_SUFFIX = re.compile(r"^KA\d{2}(AU\d{4})$")
FALSE_KA_BODY = re.compile(r"^KA\d{2}([A-Z]{2}\d{4})$")


def _is_watermark_plate_text(text: str) -> bool:
    key = plate_key(text)
    if not key:
        return False
    if any(marker in key for marker in WATERMARK_MARKERS):
        return True
    if len(key) >= 6 and len(key) % 2 == 0 and key[: len(key) // 2] == key[len(key) // 2 :]:
        return True
    return False


def _normalize_image_plate_ocr(text: str) -> str:
    key = plate_key(text)
    if not key or _is_watermark_plate_text(key):
        return key
    if US_PLATE_NEAR.match(key):
        return key[:3].translate(LETTER_SLOT_FIX) + key[3:]
    return key


def _refine_image_plate_text(text: str) -> str:
    """Image-only corrections for common OCR mistakes (false KA prefix, US letter slots)."""
    raw_key = plate_key(text)
    if not raw_key:
        return raw_key

    key = _normalize_image_plate_ocr(raw_key)

    # CZ/EU plate with blue strip misread as KA14 (Karnataka) prefix.
    match = FALSE_KA_EU_SUFFIX.match(raw_key)
    if match and is_indian_plate(raw_key):
        candidate = f"5{match.group(1)}"
        if is_plate_like(candidate):
            return candidate

    match = FALSE_KA_BODY.match(raw_key)
    if match and is_indian_plate(raw_key):
        body = match.group(1)
        if is_plate_like(body) and not is_indian_plate(body):
            return body

    return key


def _is_valid_image_plate_read(text: str) -> bool:
    key = _refine_image_plate_text(text)
    if not key or _is_watermark_plate_text(key):
        return False
    if not is_plate_like(key):
        return False
    digits = sum(char.isdigit() for char in key)
    return digits >= 2


def _image_read_score(text: str, confidence: float) -> float:
    key = _refine_image_plate_text(text)
    if not _is_valid_image_plate_read(key):
        return -1.0

    score = confidence
    if US_PLATE_NEAR.match(plate_key(text).translate(LETTER_SLOT_FIX)):
        score += 1.0
    if re.match(r"^\d[A-Z]{2}\d{4}$", key):
        score += 0.8
    if is_indian_plate(key):
        score += 0.4
        if is_indian_plate_partial(key) and not is_indian_plate(key):
            score -= 0.25
    return score


def _image_plate_rank(record: dict[str, Any]) -> tuple[float, float, float, int]:
    text = plate_key(str(record.get("plate_number", "")))
    confidence = float(record.get("plate", {}).get("confidence", 0))
    score = float(record.get("_score", 0))
    bbox_area = _plate_bbox_area(
        record.get("plate_bbox") if isinstance(record.get("plate_bbox"), list) else None
    )
    return (confidence, score, -float(bbox_area), -len(text))


def _image_detection_scale(frame: np.ndarray) -> float:
    longest = max(frame.shape[:2])
    if longest >= IMAGE_TARGET_LONGEST_SIDE:
        return 1.0
    return min(IMAGE_MAX_UPSCALE, max(1.0, IMAGE_TARGET_LONGEST_SIDE / longest))


def _upscale_image_frame(frame: np.ndarray, scale: float) -> np.ndarray:
    import cv2

    if scale <= 1.0:
        return frame
    return cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def _has_accepted_plate_results(records: list[dict[str, Any]]) -> bool:
    for record in records:
        if record.get("detection_quality") != "accepted":
            continue
        text = _refine_image_plate_text(str(record.get("plate_number", "")))
        if text and _is_valid_image_plate_read(text):
            return True
    return False


def _scale_records_to_original_frame(
    records: list[dict[str, Any]],
    scale: float,
) -> list[dict[str, Any]]:
    if scale <= 1.0:
        return records

    scaled: list[dict[str, Any]] = []
    for record in records:
        bbox = record.get("plate_bbox")
        if not isinstance(bbox, list) or len(bbox) < 4:
            continue

        next_record = dict(record)
        next_record["plate_bbox"] = _map_bbox_to_frame(bbox, scale)

        vehicle = record.get("vehicle")
        if isinstance(vehicle, dict) and isinstance(vehicle.get("bbox"), list):
            next_record["vehicle"] = {
                **vehicle,
                "bbox": _map_bbox_to_frame(vehicle["bbox"], scale),
            }

        scaled.append(next_record)

    return scaled


def _map_bbox_to_frame(bbox: list[int], scale: float) -> list[int]:
    if scale <= 1.0:
        return bbox
    return [int(round(value / scale)) for value in bbox]


def _plate_bbox_area(bbox: list[int] | None) -> int:
    if not bbox or len(bbox) < 4:
        return 0
    return max((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]), 0)


def _bbox_area_ratio(bbox: list[int], frame_shape: tuple[int, ...]) -> float:
    frame_area = max(frame_shape[0] * frame_shape[1], 1)
    return _plate_bbox_area(bbox) / frame_area


def _is_oversized_image_plate_bbox(bbox: list[int], frame_shape: tuple[int, ...]) -> bool:
    return _bbox_area_ratio(bbox, frame_shape) > MAX_IMAGE_PLATE_FRAME_AREA_RATIO


def _pick_best_image_dashboard_plates(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer tight plate crops and high-confidence reads for image uploads."""
    accepted = [record for record in records if record.get("detection_quality") == "accepted"]
    ranked = sorted(accepted, key=_image_plate_rank, reverse=True)

    unique: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in ranked:
        key = _refine_image_plate_text(str(item.get("plate_number", "")))
        if not key or not _is_valid_image_plate_read(key):
            continue

        dominated = False
        for existing in unique:
            existing_key = plate_key(str(existing.get("plate_number", "")))
            if plates_are_similar(existing_key, key):
                dominated = True
                break
        if dominated or key in seen:
            continue

        seen.add(key)
        unique.append({k: v for k, v in item.items() if k != "_score"})

    return unique


def _extract_image_plate_record(
    frame: np.ndarray,
    plate_det: dict[str, Any],
    bbox: list[int],
    track_id: str,
    min_confidence: float,
    vehicle: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    record = extract_plate_record(
        frame,
        {**plate_det, "bbox": bbox},
        0,
        0.0,
        vehicle,
        track_id,
        min_confidence,
    )
    if not record or record.get("detection_quality") == "invalid":
        return None

    refined_text = _refine_image_plate_text(str(record.get("plate_number", "")))
    if not refined_text or not _is_valid_image_plate_read(refined_text):
        if record.get("detection_quality") == "accepted":
            record["detection_quality"] = "partial"
        return record

    if refined_text != plate_key(str(record.get("plate_number", ""))):
        plate_info = dict(record.get("plate") or {})
        confidence = float(plate_info.get("confidence", 0))
        merged_ocr = {"cleaned_text": refined_text, "confidence": confidence}
        quality = (
            "accepted"
            if should_accept_detection(merged_ocr, bbox, frame.shape, min_confidence)
            else "partial"
        )
        plate_info.update(merged_ocr)
        record["plate_number"] = refined_text
        record["plate"] = plate_info
        record["detection_quality"] = quality

    return record


def _refine_oversized_plate_bbox(bbox: list[int]) -> list[int]:
    x1, y1, x2, y2 = bbox
    width = max(x2 - x1, 1)
    height = max(y2 - y1, 1)
    aspect = width / height
    if aspect >= 2.5:
        return bbox

    strip_h = max(int(height * 0.35), 12)
    strip_w = max(int(width * 0.75), 40)
    center_x = (x1 + x2) // 2
    return [
        max(0, center_x - strip_w // 2),
        max(y1, y2 - strip_h),
        center_x + strip_w // 2,
        y2,
    ]


def _shared_plate_fragment(left: str, right: str, min_len: int = 4) -> bool:
    if len(left) < min_len or len(right) < min_len:
        return False
    shorter, longer = sorted((left, right), key=len)
    for start in range(len(shorter)):
        for end in range(start + min_len, len(shorter) + 1):
            if shorter[start:end] in longer:
                return True
    return False


def _is_short_plate_variant(short: str, long: str) -> bool:
    short_key = plate_key(short)
    long_key = plate_key(long)
    if not short_key or not long_key or len(short_key) >= len(long_key):
        return False
    if short_key in long_key or long_key.endswith(short_key):
        return True
    return _shared_plate_fragment(short_key, long_key)


def _record_rank(record: dict[str, Any]) -> tuple[int, float, float, float, int]:
    quality = str(record.get("detection_quality", ""))
    quality_rank = {"accepted": 3, "partial": 2, "unreadable": 1}.get(quality, 0)
    plate_text = plate_key(str(record.get("plate_number", "")))
    bbox = record.get("plate_bbox") if isinstance(record.get("plate_bbox"), list) else [0, 0, 0, 0]
    bbox_area = max((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]), 0) if len(bbox) >= 4 else 0
    confidence = float(record.get("plate", {}).get("confidence", 0))
    return (
        quality_rank,
        confidence,
        float(record.get("_score", 0)),
        -float(bbox_area),
        -len(plate_text),
    )


def _merge_image_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    usable = [
        record
        for record in records
        if record.get("detection_quality") not in {"invalid", "unreadable"}
        and plate_key(str(record.get("plate_number", "")))
        not in {"", "UNKNOWN", "UNREADABLE", "REJECTED"}
        and not _is_watermark_plate_text(str(record.get("plate_number", "")))
    ]
    if not usable:
        return records

    usable.sort(key=_record_rank, reverse=True)
    merged: list[dict[str, Any]] = []

    for record in usable:
        text = plate_key(str(record.get("plate_number", "")))
        replace_index = -1
        dominated = False

        for index, kept in enumerate(merged):
            kept_text = plate_key(str(kept.get("plate_number", "")))
            if text == kept_text:
                dominated = True
                break
            if text in kept_text or kept_text in text or _is_short_plate_variant(text, kept_text):
                shorter, longer = sorted([text, kept_text], key=len)
                if shorter != longer and is_plate_like(shorter):
                    if text == longer:
                        dominated = True
                        break
                    replace_index = index
                    break
                if len(text) > len(kept_text):
                    replace_index = index
                    break
                dominated = True
                break
            if _is_short_plate_variant(kept_text, text):
                replace_index = index
                break

        if dominated:
            continue
        if replace_index >= 0:
            merged[replace_index] = record
            continue
        merged.append(record)

    return merged


def _best_context_plate_read(
    frame: np.ndarray,
    plate_detections: list[dict[str, Any]],
) -> dict[str, Any] | None:
    best_text = ""
    best_conf = 0.0

    invalid_dets = [
        plate_det
        for plate_det in plate_detections
        if not is_plate_bbox_valid(plate_det["bbox"], frame.shape)
    ]
    invalid_dets.sort(key=lambda item: float(item.get("confidence", 0)), reverse=True)

    for plate_det in invalid_dets[:MAX_CONTEXT_OCR_BOXES]:
        bbox = plate_det["bbox"]
        ocr = recognize_plate(frame, bbox, 0)
        text = plate_key(str(ocr.get("cleaned_text", "")))
        confidence = float(ocr.get("confidence", 0))
        if not text or text in {"UNKNOWN", "UNREADABLE", "REJECTED"}:
            continue
        if not (is_indian_plate(text) or is_indian_plate_partial(text)):
            continue
        if len(text) > len(best_text) or (len(text) == len(best_text) and confidence > best_conf):
            best_text = text
            best_conf = confidence

    if not best_text:
        return None

    return {"cleaned_text": best_text, "confidence": best_conf}


def _apply_context_plate_read(
    record: dict[str, Any],
    context_ocr: dict[str, Any] | None,
    frame_shape: tuple[int, ...],
) -> dict[str, Any]:
    """Only extend partial Indian reads — never overwrite a good tight-crop plate."""
    if not context_ocr:
        return record

    current_text = plate_key(str(record.get("plate_number", "")))
    current_quality = str(record.get("detection_quality", ""))

    if current_quality == "accepted" and current_text and is_plate_like(current_text):
        return record
    if _is_watermark_plate_text(current_text):
        return record

    context_text = plate_key(str(context_ocr.get("cleaned_text", "")))
    if not context_text or _is_watermark_plate_text(context_text):
        return record
    if len(context_text) <= len(current_text):
        return record

    # Wide-frame OCR often adds a spurious leading letter (e.g. QE99999 over E99999).
    if CHINESE_STYLE_PLATE.match(current_text) and current_text in context_text:
        return record

    # Do not paste Indian context prefixes onto EU/US reads (e.g. KA12 + AU5341).
    context_indian = is_indian_plate(context_text) or is_indian_plate_partial(context_text)
    current_indian = is_indian_plate(current_text) or is_indian_plate_partial(current_text)
    if context_indian and current_text and not current_indian:
        return record
    if not context_indian:
        return record
    if current_text and current_text not in context_text and not context_text.endswith(current_text):
        return record

    bbox = record.get("plate_bbox")
    if not isinstance(bbox, list) or len(bbox) < 4:
        return record

    merged_ocr = {
        "cleaned_text": context_text,
        "confidence": float(context_ocr.get("confidence", record.get("plate", {}).get("confidence", 0))),
    }
    quality = "accepted" if should_accept_detection(merged_ocr, bbox, frame_shape, 0.5) else "partial"

    plate_info = dict(record.get("plate") or {})
    plate_info.update(merged_ocr)
    record["plate_number"] = context_text
    record["plate"] = plate_info
    record["detection_quality"] = quality
    return record


def _recover_from_oversized_read(
    frame: np.ndarray,
    oversized_detections: list[dict[str, Any]],
    tight_record: dict[str, Any],
) -> dict[str, Any]:
    """Borrow plate text from the full YOLO box when the tight crop OCR fails."""
    if not oversized_detections:
        return tight_record

    current_text = _refine_image_plate_text(str(tight_record.get("plate_number", "")))
    tight_conf = float(tight_record.get("plate", {}).get("confidence", 0))
    tight_score = (
        _image_read_score(current_text, tight_conf)
        if current_text and _is_valid_image_plate_read(current_text)
        else -1.0
    )
    if tight_record.get("detection_quality") == "accepted" and tight_score < 0:
        return tight_record

    bbox = tight_record.get("plate_bbox")
    if not isinstance(bbox, list) or len(bbox) < 4:
        return tight_record

    best_text = ""
    best_conf = 0.0
    best_score = -1.0
    for plate_det in sorted(
        oversized_detections,
        key=lambda item: float(item.get("confidence", 0)),
        reverse=True,
    ):
        raw_bbox = plate_det["bbox"]
        ocr = recognize_plate(frame, raw_bbox, 0)
        raw_text = str(ocr.get("cleaned_text", ""))
        text = _refine_image_plate_text(raw_text)
        confidence = float(ocr.get("confidence", 0))
        score = _image_read_score(raw_text, confidence)
        if score < 0:
            continue
        if score > best_score:
            best_text = text
            best_conf = confidence
            best_score = score

    if not best_text:
        return tight_record

    if best_score <= tight_score:
        return tight_record

    merged_ocr = {"cleaned_text": best_text, "confidence": best_conf}
    quality = "accepted" if should_accept_detection(merged_ocr, bbox, frame.shape, 0.5) else "partial"
    updated = dict(tight_record)
    plate_info = dict(updated.get("plate") or {})
    plate_info.update(merged_ocr)
    updated["plate_number"] = best_text
    updated["plate"] = plate_info
    updated["detection_quality"] = quality
    return updated


def _collect_direct_image_plate_candidates(
    frame: np.ndarray,
    *,
    min_confidence: float,
    plate_confidence: float,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen_boxes: set[tuple[int, int, int, int]] = set()
    raw_detections = detect_plates(frame, plate_confidence)[:MAX_IMAGE_PLATE_CANDIDATES]

    tight_detections: list[dict[str, Any]] = []
    oversized_detections: list[dict[str, Any]] = []
    for plate_det in raw_detections:
        raw_bbox = plate_det["bbox"]
        if _is_oversized_image_plate_bbox(raw_bbox, frame.shape):
            oversized_detections.append(plate_det)
            continue
        refined = _refine_oversized_plate_bbox(raw_bbox)
        if is_plate_bbox_valid(refined, frame.shape):
            tight_detections.append(plate_det)

    if tight_detections:
        plate_detections = sorted(
            tight_detections,
            key=lambda item: _plate_bbox_area(item.get("bbox", [0, 0, 0, 0])),
        )
    else:
        plate_detections = sorted(
            oversized_detections or raw_detections,
            key=lambda item: float(item.get("confidence", 0)),
            reverse=True,
        )

    context_ocr = _best_context_plate_read(frame, raw_detections)
    valid_records: list[dict[str, Any]] = []

    for index, plate_det in enumerate(plate_detections):
        bbox = _refine_oversized_plate_bbox(plate_det["bbox"])
        if not is_plate_bbox_valid(bbox, frame.shape):
            continue
        if tight_detections and _is_oversized_image_plate_bbox(plate_det["bbox"], frame.shape):
            continue

        key = tuple(bbox)
        if key in seen_boxes:
            continue
        seen_boxes.add(key)

        record = _extract_image_plate_record(
            frame,
            plate_det,
            bbox,
            f"image_plate_{index}_{bbox[0]}",
            min_confidence,
        )
        if record:
            valid_records.append(record)

    if not valid_records:
        return candidates

    best_bbox_record = min(
        valid_records,
        key=lambda item: (
            (item.get("plate_bbox", [0, 0, 0, 0])[2] - item.get("plate_bbox", [0, 0, 0, 0])[0])
            * (item.get("plate_bbox", [0, 0, 0, 0])[3] - item.get("plate_bbox", [0, 0, 0, 0])[1])
        ),
    )

    for record in valid_records:
        if record is best_bbox_record:
            recovered = _recover_from_oversized_read(frame, oversized_detections, record)
            candidates.append(_apply_context_plate_read(recovered, context_ocr, frame.shape))
        else:
            candidates.append(record)

    return candidates


def _collect_vehicle_plate_candidates(
    frame: np.ndarray,
    *,
    min_confidence: float,
    plate_confidence: float,
) -> list[dict[str, Any]]:
    vehicles = sorted(
        detect_vehicles(frame, confidence_threshold=0.3),
        key=lambda item: float(item.get("confidence", 0)),
        reverse=True,
    )[:MAX_IMAGE_VEHICLE_CANDIDATES]
    candidates: list[dict[str, Any]] = []
    seen_boxes: set[tuple[int, int, int, int]] = set()

    for index, vehicle in enumerate(vehicles):
        x1, y1, x2, y2 = vehicle["bbox"]
        vehicle_h = max(y2 - y1, 1)
        crop_y1 = y1 + int(vehicle_h * 0.52)
        crop = frame[crop_y1:y2, x1:x2]
        if crop.size == 0:
            continue

        plate_detections = detect_plates(crop, plate_confidence)
        for plate_det in plate_detections:
            px1, py1, px2, py2 = plate_det["bbox"]
            bbox = [px1 + x1, py1 + crop_y1, px2 + x1, py2 + crop_y1]
            bbox = _refine_oversized_plate_bbox(bbox)
            if not is_plate_bbox_valid(bbox, frame.shape):
                continue

            key = tuple(bbox)
            if key in seen_boxes:
                continue
            seen_boxes.add(key)

            record = _extract_image_plate_record(
                frame,
                plate_det,
                bbox,
                f"image_vehicle_{index}_{bbox[0]}",
                min_confidence,
                vehicle,
            )
            if record:
                candidates.append(record)

    return candidates


def run_image_detection_pipeline(
    frame: np.ndarray,
    *,
    confidence_threshold: float = 0.5,
    min_plate_confidence: float = 0.7,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Detect plates in a single uploaded image using the image-specific pipeline."""
    start = time.time()

    batch_context.set_image_mode()

    if progress_callback:
        progress_callback(0, 1)

    relaxed_min_plate = min(min_plate_confidence, 0.5)

    frame_results = _collect_direct_image_plate_candidates(
        frame,
        min_confidence=relaxed_min_plate,
        plate_confidence=IMAGE_PLATE_CONFIDENCE,
    )

    if not _has_accepted_plate_results(frame_results):
        detection_scale = _image_detection_scale(frame)
        detection_frame = _upscale_image_frame(frame, detection_scale) if detection_scale > 1.0 else frame

        scaled_results = _collect_direct_image_plate_candidates(
            detection_frame,
            min_confidence=relaxed_min_plate,
            plate_confidence=IMAGE_PLATE_CONFIDENCE,
        )
        scaled_results = _scale_records_to_original_frame(scaled_results, detection_scale)

        if not _has_accepted_plate_results(frame_results + scaled_results):
            vehicle_results = _collect_vehicle_plate_candidates(
                detection_frame,
                min_confidence=relaxed_min_plate,
                plate_confidence=0.18,
            )
            scaled_results.extend(_scale_records_to_original_frame(vehicle_results, detection_scale))

        frame_results = _merge_image_records(frame_results + scaled_results)
    else:
        frame_results = _merge_image_records(frame_results)

    detections = [
        {**item, "is_repeat_detection": False, "pipeline_mode": "image_upload"}
        for item in frame_results
    ]
    unique_tracks = {str(item.get("track_id", "image_0")) for item in detections}

    if progress_callback:
        progress_callback(1, 1)

    batch_context.clear_media_mode()
    elapsed = time.time() - start

    # Image uploads keep tight-crop reads; video consolidation prefers longer variants.
    log_records = [{k: v for k, v in d.items() if k != "_score"} for d in detections]
    unique_accepted = _pick_best_image_dashboard_plates(detections)

    if len(unique_accepted) == 1:
        full_snapshot = encode_full_frame_snapshot(frame)
        if full_snapshot:
            unique_accepted[0]["dashboard_image_base64"] = full_snapshot
            unique_accepted[0]["snapshot_mode"] = "full_frame_single_plate"

    unique_plates = {plate_key(str(d.get("plate_number", ""))) for d in unique_accepted}

    return {
        "total_frames": 1,
        "frames_processed": 1,
        "max_frames": 1,
        "total_detections": len(log_records),
        "unique_vehicles": len(unique_plates) or len(unique_tracks),
        "unique_plates": len(unique_plates),
        "processing_time_seconds": round(elapsed, 2),
        "fps": round(1 / elapsed, 2) if elapsed > 0 else 0,
        "detections": log_records,
        "dashboard_plates": unique_accepted,
        "media_type": "image",
        "detection_pipeline": "image_upload",
    }
