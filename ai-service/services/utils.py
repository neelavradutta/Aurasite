from typing import Any

from services.plate_format import normalize_plate_text


def normalize_plate(raw_text: str) -> dict[str, Any]:
    return normalize_plate_text(raw_text, confidence=0.85)
