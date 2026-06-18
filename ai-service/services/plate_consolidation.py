"""Video-level plate clustering — adapted from reference LPR backend."""

from __future__ import annotations

from typing import Any

from services.plate_format import is_indian_plate, is_indian_plate_partial, is_valid_plate
from services.plate_quality import is_plate_like, plate_key, plates_are_similar
from services.video_plate_processing import (
    is_european_video_plate,
    is_false_indian_video_plate,
    is_video_batch_record,
)


def _prefer_longer_reads(records: list[dict[str, Any]]) -> bool:
    return False


def _record_rank(item: dict[str, Any], prefer_longer: bool = False) -> tuple[float, float, float, float, float, int]:
    plate = plate_key(str(item.get("plate_number", "")))
    confidence = float(item.get("plate", {}).get("confidence", 0))
    score = float(item.get("_score", 0))
    if prefer_longer and is_false_indian_video_plate(plate):
        layout = 0.0
        video_layout = 0.0
        length_rank = -len(plate)
    else:
        layout = 1.0 if is_valid_plate(plate) else 0.0
        video_layout = 1.0 if prefer_longer and is_european_video_plate(plate) else 0.0
        if prefer_longer or is_indian_plate(plate) or is_indian_plate_partial(plate):
            length_rank = len(plate)
        else:
            length_rank = -len(plate)
    indian = 1.0 if is_indian_plate(plate) else 0.5 if is_indian_plate_partial(plate) else 0.0
    if prefer_longer and is_european_video_plate(plate):
        indian = 0.0
    return (video_layout, layout, indian, confidence, score, length_rank)


def _pick_canonical_plate(
    records: list[dict[str, Any]],
    member_indices: list[int],
    prefer_longer: bool = False,
) -> str:
    plates = [plate_key(str(records[i].get("plate_number", ""))) for i in member_indices]
    plates = [p for p in plates if p and is_plate_like(p)]
    if not plates:
        return plate_key(str(records[member_indices[0]].get("plate_number", "")))

    ranked = sorted(
        member_indices,
        key=lambda i: _record_rank(records[i], prefer_longer),
        reverse=True,
    )
    best = plate_key(str(records[ranked[0]].get("plate_number", "")))

    for plate in plates:
        if plate == best:
            continue
        if not plates_are_similar(plate, best):
            continue
        shorter, longer = sorted((plate, best), key=len)
        if shorter != longer and (shorter in longer or longer.endswith(shorter) or longer.startswith(shorter)):
            if is_indian_plate(longer) and not is_indian_plate(shorter):
                best = longer
            elif is_indian_plate_partial(shorter) and not is_indian_plate(longer):
                best = shorter
            else:
                best = shorter
            continue
        if shorter in longer and is_plate_like(shorter):
            if prefer_longer and is_european_video_plate(longer):
                best = longer
            elif prefer_longer and is_false_indian_video_plate(best) and is_european_video_plate(longer):
                best = longer
            elif prefer_longer and is_plate_like(longer):
                best = longer
            elif is_valid_plate(longer) and len(longer) > len(shorter):
                best = longer
            elif is_indian_plate(longer) and is_valid_plate(longer):
                best = longer
            elif is_indian_plate_partial(shorter) and not is_indian_plate(longer):
                best = shorter
            elif not prefer_longer and (is_valid_plate(shorter) or not is_valid_plate(longer)):
                best = shorter

    return best


def consolidate_video_plates(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Cluster similar OCR reads across the video and assign one canonical plate per cluster.
    Keeps every frame record for the log; dashboard dedupe uses the canonical text.
    """
    accepted_indices = [
        index
        for index, record in enumerate(records)
        if record.get("detection_quality") == "accepted"
    ]

    clusters: list[dict[str, Any]] = []
    prefer_longer = _prefer_longer_reads(records)

    for index in sorted(
        accepted_indices,
        key=lambda i: _record_rank(records[i], prefer_longer),
        reverse=True,
    ):
        plate = plate_key(str(records[index].get("plate_number", "")))
        if not is_plate_like(plate):
            records[index]["detection_quality"] = "partial"
            continue

        matched = None
        for cluster in clusters:
            if plates_are_similar(plate, cluster["plate"]):
                matched = cluster
                break

        if matched is None:
            clusters.append({"plate": plate, "members": [index], "best_idx": index})
            continue

        matched["members"].append(index)
        if _record_rank(records[index], prefer_longer) > _record_rank(records[matched["best_idx"]], prefer_longer):
            matched["best_idx"] = index

    for cluster in clusters:
        canonical = _pick_canonical_plate(records, cluster["members"], prefer_longer)
        for index in cluster["members"]:
            records[index]["plate_number"] = canonical
            plate = records[index].get("plate")
            if isinstance(plate, dict):
                plate["cleaned_text"] = canonical

    return records
