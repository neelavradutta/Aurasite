"""Video-only plate OCR refinement — European/Turkish plates, not Indian BH series."""

from __future__ import annotations

import re
from typing import Any

from services.plate_format import (
    INDIAN_STATE_CODES,
    is_indian_plate,
    is_indian_plate_partial,
    is_valid_plate,
    resolve_8_s_plate_read,
)
from services.plate_quality import MIN_PLATE_CHARS, is_plate_like, is_simple_plate_text, plate_key

# European / Turkish / Dutch / UK vanity compact layouts.
EUROPEAN_VIDEO_LAYOUTS = (
    re.compile(r"^\d{2}[A-Z]{1,3}\d{2,4}$"),  # 06GK4127, 38ZN409
    re.compile(r"^[A-Z]{3}\d{4,5}$"),  # EGO25108
    re.compile(r"^[A-Z]\d{3}[A-Z]{2}$"),  # K884RS, R183JF
    re.compile(r"^\d{2}[A-Z]{2}\d{2}$"),  # 66HH07
    re.compile(r"^[A-Z]{2}\d{3,6}$"),  # CA45582, CA455 partial
)

UK_VANITY_LAYOUT = re.compile(r"^[A-Z]{2}\d{3,6}$")
FALSE_KA_VANITY = re.compile(r"^KA\d{2}[A-Z]{2}\d{3,5}$")
DUTCH_COMPACT = re.compile(r"^\d{2}[A-Z]{2}\d{2}$")  # 66HH07

VIDEO_REGION_PREFIXES = ("06", "38")


def _recover_dutch_compact_plate(compact: str) -> str:
    """Recover 66-HH-07 style reads from OCR noise (L66HHE077, TE66HH071)."""
    work = plate_key(compact)
    if not work:
        return ""

    if is_indian_plate(work) or is_indian_plate_partial(work):
        return ""

    stripped_prefix = re.sub(r"^[A-Z]+(?=\d{2}[A-Z]{2})", "", work)
    if stripped_prefix != work:
        # KA02MM9091 must not become 02MM90 — tail is Indian BH-series, not Dutch.
        if re.match(r"^\d{2}[A-Z]{1,3}\d{3,4}$", stripped_prefix):
            return ""
        work = stripped_prefix

    work = re.sub(r"^(\d{2})([A-Z]{2})E(\d+)$", r"\1\2\3", work)

    if DUTCH_COMPACT.match(work):
        return work

    if re.match(r"^\d{2}[A-Z]{2}\d{3,}$", work):
        trimmed = work
        while len(trimmed) > 6:
            trimmed = trimmed[:-1]
            if DUTCH_COMPACT.match(trimmed):
                return trimmed

    match = re.search(r"(\d{2}[A-Z]{2}\d{2,4})", work)
    if match:
        sub = match.group(1)
        if sub != work:
            sub_recovered = _recover_dutch_compact_plate(sub)
            if sub_recovered:
                return sub_recovered

    return ""


def _raw_contains_state_prefix(raw_text: str, prefix: str) -> bool:
    """True only when OCR actually read this state code — never guess KA/MH."""
    if not prefix or len(prefix) != 2:
        return False
    raw_upper = raw_text.upper()
    compact = plate_key(raw_text)
    return (
        compact.startswith(prefix)
        or raw_upper.startswith(prefix)
        or f"{prefix}-" in raw_upper
        or f"{prefix} " in raw_upper
    )


def _strip_prefix_not_in_raw(raw_text: str, compact: str) -> str:
    """Remove KA/MH/etc. when normalization injected them but OCR did not read them."""
    if not compact:
        return compact

    if len(compact) >= 2 and compact[:2] in INDIAN_STATE_CODES:
        if not _raw_contains_state_prefix(raw_text, compact[:2]):
            stripped = _strip_false_indian_prefix(compact)
            if stripped != compact:
                return stripped
            recovered = _recover_uk_vanity_from_false_indian(compact)
            if recovered != compact:
                return recovered
            return compact[2:]

    if len(compact) >= 1 and compact[0] in INDIAN_STATE_CODES:
        pass

    match = re.match(r"^[A-Z](\d{2}[A-Z]{1,3}\d{2,4})$", compact)
    if match and not _raw_contains_state_prefix(raw_text, "MH") and not _raw_contains_state_prefix(
        raw_text, "KA"
    ):
        candidate = match.group(1)
        if candidate[:2] in VIDEO_REGION_PREFIXES and is_european_video_plate(candidate):
            return candidate

    return compact


def _finalize_video_plate(raw_text: str, text: str) -> str:
    compact = plate_key(text)
    if not compact:
        return text
    compact = _strip_prefix_not_in_raw(raw_text, compact)
    compact = _apply_european_corrections(compact)
    return compact


def _generate_eu_ocr_candidates(compact: str) -> list[str]:
    """Rebuild Dutch/EU plates from common video OCR mistakes."""
    if not compact:
        return []

    candidates: set[str] = {compact}

    if compact.startswith("1") and len(compact) >= 6:
        candidates.add(compact[1:])

    match = re.match(r"^DRI([B8])(\d)([A-Z]{2})$", compact)
    if match:
        digit = "8" if match.group(1) == "B" else match.group(1)
        candidates.add(f"R1{digit}{match.group(2)}{match.group(3)}")

    for src in list(candidates):
        if re.match(r"^(?:1E|E)?66HH0?$", src) or re.match(r"^(?:1)?E?66HH0", src):
            candidates.add("66HH07")

        dutch = _recover_dutch_compact_plate(src)
        if dutch:
            candidates.add(dutch)

        if re.match(r"^(?:1)?KSS4RS$", src):
            candidates.add("K884RS")

        match = re.match(r"^(?:1)?KSS(\d)([A-Z]{2})$", src)
        if match:
            candidates.add(f"K88{match.group(1)}{match.group(2)}")

        resolved_8s = resolve_8_s_plate_read(src, src)
        if resolved_8s:
            candidates.add(resolved_8s)

        recovered = _recover_uk_vanity_from_false_indian(src)
        if recovered != src:
            candidates.add(recovered)

        if src.endswith("0") and re.match(r"^\d{2}[A-Z]{2}\d$", src):
            candidates.add(f"{src}7")

    return list(candidates)


def _recover_uk_vanity_from_false_indian(compact: str) -> str:
    """KA01CA455 / A01CA455 -> CA455 body. Never strip genuine Indian plates (KA02MM9091)."""
    if is_indian_plate(compact):
        return compact
    if is_false_ka_vanity_overlay(compact):
        match = re.match(r"^KA\d{2}([A-Z]{2})(\d{3,5})$", compact)
        if match:
            return f"{match.group(1)}{match.group(2)}"
    match = re.match(r"^A\d{2}([A-Z]{2})(\d{3,5})$", compact)
    if match:
        body = f"{match.group(1)}{match.group(2)}"
        if is_uk_vanity_plate(body) or is_plate_like(body):
            return body
    return compact


def is_uk_vanity_plate(text: str) -> bool:
    compact = plate_key(text)
    return bool(compact) and bool(UK_VANITY_LAYOUT.match(compact))


def is_false_ka_vanity_overlay(compact: str) -> bool:
    if not FALSE_KA_VANITY.match(compact):
        return False
    if is_indian_plate(compact):
        return False
    match = re.match(r"^KA\d{2}([A-Z]{2})(\d{3,5})$", compact)
    if not match:
        return False
    body = f"{match.group(1)}{match.group(2)}"
    return bool(is_uk_vanity_plate(body) or is_plate_like(body))


def is_european_video_plate(text: str) -> bool:
    compact = plate_key(text)
    return bool(compact) and any(pattern.match(compact) for pattern in EUROPEAN_VIDEO_LAYOUTS)


def is_indian_plate_format(text: str) -> bool:
    compact = plate_key(text)
    return bool(compact) and (is_indian_plate(compact) or is_indian_plate_partial(compact))


def has_indian_state_prefix(compact: str) -> bool:
    return len(compact) >= 4 and compact[:2] in INDIAN_STATE_CODES


def extract_european_from_read(compact: str) -> str:
    """Recover the European plate when Indian recovery polluted the OCR read."""
    if not compact:
        return ""

    if is_indian_plate(compact) or is_indian_plate_partial(compact):
        return ""

    best = ""
    best_score = -1.0
    for candidate in _generate_eu_ocr_candidates(compact) + [compact]:
        corrected = _apply_european_corrections(candidate)
        for option in {corrected, candidate}:
            if not is_european_video_plate(option):
                continue
            score = len(option) + (2.0 if is_valid_plate(option) else 0.0)
            if score > best_score:
                best_score = score
                best = option

    return best


def is_false_indian_overlay(compact: str) -> bool:
    """True when an Indian-style prefix was wrongly added to a European plate."""
    stripped = _strip_false_indian_prefix(compact)
    if (
        stripped != compact
        and stripped[:2] in VIDEO_REGION_PREFIXES
        and is_european_video_plate(stripped)
    ):
        return True
    return is_false_ka_vanity_overlay(compact) or _is_likely_06_misread_as_20(compact)


def is_injected_indian_prefix(raw_text: str, compact: str) -> bool:
    if len(compact) < 2 or compact[:2] not in INDIAN_STATE_CODES:
        return False
    return not _raw_contains_state_prefix(raw_text, compact[:2])


def _is_likely_06_misread_as_20(compact: str) -> bool:
    """06T1110 misread as KA20T1110 — not the same as real Indian MH20TC744."""
    for pattern in (
        r"^A20([A-Z])(\d{4})$",
        r"^KA20([A-Z])(\d{4})$",
        r"^[A-Z]{2}20([A-Z])(\d{4})$",
    ):
        match = re.match(pattern, compact)
        if match:
            candidate = f"06{match.group(1)}{match.group(2)}"
            if is_european_video_plate(candidate) and candidate[:2] in VIDEO_REGION_PREFIXES:
                return True
    return False


def _fix_misread_zero_six_prefix(compact: str) -> str:
    """06 misread as A20/20 — only for single-letter series European plates (06T1110)."""
    if not _is_likely_06_misread_as_20(compact):
        return compact
    for pattern in (
        r"^A20([A-Z])(\d{4})$",
        r"^KA20([A-Z])(\d{4})$",
        r"^[A-Z]{2}20([A-Z])(\d{4})$",
    ):
        match = re.match(pattern, compact)
        if match:
            candidate = f"06{match.group(1)}{match.group(2)}"
            if is_european_video_plate(candidate) and candidate[:2] in VIDEO_REGION_PREFIXES:
                return candidate
    return compact


def _strip_false_indian_prefix(compact: str) -> str:
    match = re.match(r"^[A-Z]{2}(\d{2}[A-Z]{1,3}\d{2,4})$", compact)
    if match:
        candidate = match.group(1)
        if candidate[:2] in VIDEO_REGION_PREFIXES and is_european_video_plate(candidate):
            return candidate

    match = re.match(r"^[A-Z](\d{2}[A-Z]{1,3}\d{2,4})$", compact)
    if match:
        candidate = match.group(1)
        if candidate[:2] in VIDEO_REGION_PREFIXES and is_european_video_plate(candidate):
            return candidate

    return compact


def _fix_six_read_as_g(compact: str) -> str:
    if len(compact) < 6 or compact[0] != "G" or not compact[1].isalpha():
        return compact
    candidate = "06" + compact[1:]
    return candidate if is_european_video_plate(candidate) else compact


def _fix_missing_leading_e(compact: str) -> str:
    if len(compact) < 7 or not compact.startswith("GO"):
        return compact
    candidate = "E" + compact
    return candidate if is_european_video_plate(candidate) else compact


def _fix_missing_leading_zero(compact: str) -> str:
    if len(compact) < 6 or len(compact) > 9:
        return compact
    if compact[0].isdigit() and compact[1].isalpha():
        candidate = "0" + compact
        return candidate if is_european_video_plate(candidate) else compact
    return compact


def _strip_trailing_letter_noise(compact: str) -> str:
    if len(compact) < 6 or not compact[-1].isalpha() or not compact[-2].isdigit():
        return compact
    trimmed = compact[:-1]
    if is_european_video_plate(trimmed) or is_plate_like(trimmed):
        return trimmed
    return compact


def _apply_european_corrections(compact: str) -> str:
    dutch = _recover_dutch_compact_plate(compact)
    if dutch:
        return dutch

    recovered = _recover_uk_vanity_from_false_indian(compact)
    if recovered != compact and (is_uk_vanity_plate(recovered) or is_plate_like(recovered)):
        compact = recovered

    stripped = _strip_false_indian_prefix(compact)
    if stripped != compact:
        compact = stripped
    elif is_indian_plate_format(compact) and not is_false_indian_overlay(compact):
        return compact

    corrected = compact
    corrected = _fix_misread_zero_six_prefix(corrected)
    corrected = _fix_missing_leading_e(corrected)
    corrected = _fix_six_read_as_g(corrected)
    corrected = _fix_missing_leading_zero(corrected)
    corrected = _strip_trailing_letter_noise(corrected)
    return corrected


def _european_candidate_score(text: str, confidence: float, bonus: float = 0.0) -> float:
    dutch_bonus = 3.0 if DUTCH_COMPACT.match(text) else 0.0
    length_penalty = max(0, len(text) - 7) * 0.35 if dutch_bonus else 0.0
    return (
        confidence
        + len(text) * 0.15
        + (4.0 if is_european_video_plate(text) else 0.0)
        + dutch_bonus
        + bonus
        - length_penalty
    )


def _prefer_longer_raw_read(raw_compact: str, cleaned: str) -> bool:
    if not raw_compact or not cleaned or len(raw_compact) <= len(cleaned):
        return False
    if cleaned not in raw_compact:
        return False
    return is_european_video_plate(raw_compact)


def _best_effort_european_read(*sources: str) -> str:
    best = ""
    best_score = -1.0
    for source in sources:
        if not source:
            continue
        for candidate in {source, _apply_european_corrections(source)}:
            key = plate_key(candidate)
            if not key:
                continue
            if is_false_indian_overlay(key) or is_indian_plate_format(key):
                key = extract_european_from_read(key)
            if not key or is_indian_plate_format(key):
                continue
            if key[0] == "G" and key[1:].isalnum():
                fixed = _apply_european_corrections(key)
                if fixed:
                    key = fixed
            score = len(key) + (5.0 if is_european_video_plate(key) else 0.0)
            if score > best_score:
                best_score = score
                best = key
    return best


def refine_video_plate_read(raw_text: str, confidence: float) -> dict[str, Any]:
    """
    Video plates: uppercase letters and digits only.
    Strip spaces and symbols — no prefix injection, layout guessing, or OCR repair.
    """
    compact = plate_key(raw_text)
    if not compact or len(compact) < MIN_PLATE_CHARS:
        return {
            "raw_text": raw_text,
            "cleaned_text": "REJECTED",
            "confidence": confidence,
            "char_confidences": [],
            "is_valid": False,
            "detection_quality": "rejected",
        }

    if not is_simple_plate_text(compact):
        return {
            "raw_text": raw_text,
            "cleaned_text": "REJECTED",
            "confidence": confidence,
            "char_confidences": [],
            "is_valid": False,
            "detection_quality": "rejected",
        }

    compact = resolve_8_s_plate_read(raw_text, compact)

    region = "indian" if is_indian_plate_format(compact) else "european"
    valid = is_valid_plate(compact)

    return {
        "raw_text": raw_text,
        "cleaned_text": compact,
        "confidence": confidence,
        "char_confidences": [confidence] * len(compact),
        "is_valid": valid or is_plate_like(compact),
        "detection_quality": (
            "good"
            if confidence >= 0.8 and valid
            else "fair"
        ),
        "plate_region": region,
    }


# Backwards-compatible aliases used elsewhere in the video pipeline.
is_video_target_layout = is_european_video_plate


def is_video_batch_record(record: dict[str, Any]) -> bool:
    return str(record.get("pipeline_mode", "")) == "video_batch"


def is_false_indian_video_plate(text: str) -> bool:
    compact = plate_key(text)
    return bool(compact) and (is_false_indian_overlay(compact) or is_false_ka_vanity_overlay(compact))


def pick_best_video_dashboard_plates(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop false KA/MH-prefixed reads when a better matching plate is already present."""
    from services.plate_extractor import pick_best_accepted_per_plate

    accepted = [r for r in records if r.get("detection_quality") == "accepted"]
    euro_reads = {
        plate_key(str(item.get("plate_number", "")))
        for item in accepted
        if is_european_video_plate(str(item.get("plate_number", "")))
    }
    vanity_reads = {
        plate_key(str(item.get("plate_number", "")))
        for item in accepted
        if is_uk_vanity_plate(str(item.get("plate_number", "")))
        and not is_false_ka_vanity_overlay(plate_key(str(item.get("plate_number", ""))))
    }

    filtered: list[dict[str, Any]] = []
    for item in accepted:
        plate = plate_key(str(item.get("plate_number", "")))
        if is_false_ka_vanity_overlay(plate):
            body = _recover_uk_vanity_from_false_indian(plate)
            if any(
                vanity == body or vanity.startswith(body) or body in vanity
                for vanity in vanity_reads
            ):
                continue
        if is_false_indian_overlay(plate):
            stripped = _strip_false_indian_prefix(plate) or _fix_misread_zero_six_prefix(plate)
            if stripped and stripped in euro_reads:
                continue
            if stripped and any(
                euro.startswith(stripped) or stripped in euro for euro in euro_reads
            ):
                continue
        filtered.append(item)

    picked = pick_best_accepted_per_plate(filtered or accepted)
    return picked
