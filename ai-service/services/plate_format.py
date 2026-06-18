import re
from typing import Any

# Indian RTO state / UT codes (BH series: XX-00-XX-0000)
INDIAN_STATE_CODES = frozenset(
    {
        "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ",
        "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP",
        "MZ", "NL", "OD", "OR", "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "UK",
        "UP", "WB",
    }
)
INDIAN_PLATE_COMPACT = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$")
INDIAN_PLATE_PARTIAL = re.compile(r"^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{3})$")
INDIAN_PLATE_DASHED = re.compile(r"^[A-Z]{2}-\d{2}-[A-Z]{1,3}-\d{4}$")
COMMON_INDIAN_STATE_PRIORITY = {
    "KA": 10,
    "MH": 9,
    "TN": 9,
    "DL": 8,
    "UP": 8,
    "GJ": 7,
    "KL": 7,
    "TS": 7,
    "WB": 7,
    "RJ": 6,
    "HR": 6,
    "AP": 6,
    "MP": 6,
    "BR": 5,
    "PB": 5,
    "OR": 5,
    "OD": 5,
}

# Common EU / US style plates seen in demo footage
PLATE_PATTERNS = [
    re.compile(r"^[A-Z]{1,2}-\d{3}-[A-Z]{2}$"),  # L-605-HZ, K-884-RS
    re.compile(r"^[A-Z]{2}\d{2}-[A-Z]{2,3}$"),  # UK: LS15-EBC
    re.compile(r"^[A-Z]{2}-\d{2}-[A-Z]{2}$"),  # 66-HH-07 style variants
    re.compile(r"^\d{2}-[A-Z]{2}-\d{2}$"),
    re.compile(r"^[A-Z]{2}\d{5,6}$"),  # CA455822 style
    re.compile(r"^[A-Z0-9]{5,8}$"),  # ADVNTXR, US vanity
    re.compile(r"^[A-Z0-9]{2,3}-[A-Z0-9]{3,4}$"),
    INDIAN_PLATE_DASHED,  # KA-02-MM-9091
]

# Never map 8<->S globally — position decides (K884 digit 8 vs LS15 letter S).
DIGIT_LIKE = str.maketrans({"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "G": "6"})
LETTER_LIKE = str.maketrans({"0": "O", "1": "I", "5": "S", "6": "G"})
EIGHT_S_AMBIGUOUS = frozenset("8S")
ROLE_TEMPLATES_BY_LENGTH: dict[int, list[str]] = {
    6: ["LDDDLL", "DDLLDD", "LLDDLL"],
    7: ["LLDDLLL"],
    8: ["LLDDLLLL"],
}
UK_PLATE_COMPACT = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{2,3}$")


def clean_plate_text(text: str) -> str:
    """Uppercase alphanumeric plate — strip spaces and symbols only."""
    cleaned = _strip_noise(text)
    return cleaned if len(cleaned) >= 4 else ""


def simple_plate_text(text: str) -> str:
    """Same as clean_plate_text — single canonical simple plate formatter."""
    return clean_plate_text(text)


def _strip_noise(text: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9]", "", text.upper().strip())
    return cleaned


def is_indian_plate(text: str) -> bool:
    compact = _strip_noise(text)
    if not INDIAN_PLATE_COMPACT.match(compact):
        return False
    return compact[:2] in INDIAN_STATE_CODES


def is_indian_plate_partial(text: str) -> bool:
    """BH-series plate missing the final number digit (e.g. KA02MM909)."""
    compact = _strip_noise(text)
    match = INDIAN_PLATE_PARTIAL.match(compact)
    if not match:
        return False
    return match.group(1) in INDIAN_STATE_CODES


def _format_indian_plate(raw: str) -> str | None:
    compact = _strip_noise(raw)
    match = INDIAN_PLATE_COMPACT.match(compact)
    if not match:
        return None
    state = compact[:2]
    if state not in INDIAN_STATE_CODES:
        return None
    rto = compact[2:4]
    series_end = len(compact) - 4
    series = compact[4:series_end]
    number = compact[series_end:]
    return f"{state}-{rto}-{series}-{number}"


def _recover_indian_candidates(raw: str) -> list[str]:
    """Rebuild BH-series plates when OCR drops the state prefix — never guess the last digit."""
    compact = _strip_noise(raw)
    if not compact:
        return []

    recovered: set[str] = set()
    if is_indian_plate(compact):
        recovered.add(compact)

    if is_indian_plate_partial(compact):
        recovered.add(compact)

    # Missing state first letter only (e.g. A02MM909 -> KA02MM909, H20TC744 -> MH20TC744)
    match = re.match(r"^([A-Z])(\d{2})([A-Z]{1,3})(\d{3,4})$", compact)
    if match:
        tail, rto, series, number = match.groups()
        for prefix in INDIAN_STATE_CODES:
            if not prefix.endswith(tail):
                continue
            candidate = f"{prefix}{rto}{series}{number}"
            if is_indian_plate(candidate) or is_indian_plate_partial(candidate):
                recovered.add(candidate)

    # Missing state + RTO digits (e.g. TC744A / 2TC744A from tight plate crops)
    match = re.match(r"^(\d?)([A-Z]{1,3})(\d{3,4})([A-Z]?)$", compact)
    if match:
        leading, series, number, suffix = match.groups()
        series_number = f"{series}{number}{suffix}"
        for prefix in INDIAN_STATE_CODES:
            for rto in ("20", "01", "02", "12", "14"):
                candidate = f"{prefix}{rto}{series_number}"
                if is_indian_plate(candidate) or is_indian_plate_partial(candidate):
                    recovered.add(candidate)

    return list(recovered)


def _indian_recovery_bonus(original: str, candidate: str) -> float:
    """Prefer minimal prefix/suffix fixes and common state codes."""
    orig = _strip_noise(original)
    compact = _strip_noise(candidate)
    if not orig or not compact:
        return 0.0

    bonus = 0.0
    if len(compact) == len(orig) + 2 and compact[1:-1] == orig:
        bonus += 1.5
    elif len(compact) == len(orig) + 1:
        if compact[1:] == orig:
            bonus += 1.2
        elif compact[:-1] == orig:
            bonus += 1.0
    elif orig in compact:
        bonus += 0.6

    bonus += COMMON_INDIAN_STATE_PRIORITY.get(compact[:2], 0) * 0.08

    return bonus


def _format_known_layout(raw: str) -> str | None:
    s = _strip_noise(raw)
    if not s:
        return None

    # 1 letter + 3 digits + 2 letters -> K-884-RS
    match = re.match(r"^([A-Z])(\d{3})([A-Z]{2})$", s)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # 2 digits + 2 letters + 2 digits -> 66-HH-07
    match = re.match(r"^(\d{2})([A-Z]{2})(\d{2})$", s)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # 2 letters + 3 digits + 2 letters -> AB-123-CD
    match = re.match(r"^([A-Z]{2})(\d{3})([A-Z]{2})$", s)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # UK current format: LS15-EBC (2 letters + 2 digits + 2-3 letters)
    match = re.match(r"^([A-Z]{2})(\d{2})([A-Z]{2,3})$", s)
    if match:
        return f"{match.group(1)}{match.group(2)}-{match.group(3)}"

    indian = _format_indian_plate(s)
    if indian:
        return indian

    # US vanity / compact alphanumeric
    if 5 <= len(s) <= 8 and s.isalnum():
        return s

    return None


def _char_matches_role(char: str, role: str) -> bool:
    if role == "L":
        return char.isalpha() or char in EIGHT_S_AMBIGUOUS
    if role == "D":
        return char.isdigit() or char in "OIL" or char in EIGHT_S_AMBIGUOUS
    return True


def _char_matches_template(compact: str, roles: str) -> bool:
    if len(compact) != len(roles):
        return False
    return all(_char_matches_role(char, role) for char, role in zip(compact, roles))


def _infer_roles(compact: str) -> str | None:
    for template in ROLE_TEMPLATES_BY_LENGTH.get(len(compact), []):
        if _char_matches_template(compact, template):
            return template

    if UK_PLATE_COMPACT.match(compact) or _looks_uk_ocr(compact):
        suffix = len(compact) - 4
        if suffix in (2, 3):
            return "LLDD" + "L" * suffix
    return None


def _fix_letter_char(char: str) -> str:
    if char == "8":
        return "S"
    return char.translate(LETTER_LIKE) if not char.isdigit() else char


def _fix_digit_char(char: str) -> str:
    if char in {"S", "B"}:
        return "8"
    return char.translate(DIGIT_LIKE)


def _correct_numeric_segment(segment: str) -> str:
    return "".join(_fix_digit_char(ch) for ch in segment)


def _correct_letter_segment(segment: str) -> str:
    return "".join(_fix_letter_char(ch) for ch in segment)


def _apply_role_corrections(compact: str, roles: str | None = None) -> str:
    roles = roles or _infer_roles(compact)
    if not roles or len(roles) != len(compact):
        return compact

    chars = list(compact)
    for idx, (char, role) in enumerate(zip(chars, roles)):
        if role == "L":
            chars[idx] = _fix_letter_char(char)
        elif role == "D":
            chars[idx] = _fix_digit_char(char)
    return "".join(chars)


def _expand_8_s_variants(compact: str) -> set[str]:
    variants = {compact}
    roles = _infer_roles(compact)

    for idx, char in enumerate(compact):
        if char not in EIGHT_S_AMBIGUOUS:
            continue

        alternatives: list[str] = []
        if roles and idx < len(roles):
            if roles[idx] == "L" and char == "8":
                alternatives = ["S"]
            elif roles[idx] == "D" and char == "S":
                alternatives = ["8"]
        else:
            if char == "8":
                alternatives = ["S"]
            elif char == "S":
                alternatives = ["8"]

        for alt in alternatives:
            mutated = list(compact)
            mutated[idx] = alt
            variants.add("".join(mutated))

    return variants


def _eight_s_disambiguation_bonus(original: str, candidate: str) -> float:
    orig = _strip_noise(original)
    cand = _strip_noise(candidate)
    if not orig or not cand or orig == cand or len(orig) != len(cand):
        return 0.0

    roles = _infer_roles(cand)
    if not roles or len(roles) != len(cand):
        return 0.0

    bonus = 0.0
    for idx, role in enumerate(roles):
        if idx >= len(orig) or idx >= len(cand) or orig[idx] == cand[idx]:
            continue
        original_char = orig[idx]
        candidate_char = cand[idx]
        if role == "L" and original_char == "8" and candidate_char == "S":
            bonus += 0.5
        elif role == "D" and original_char == "S" and candidate_char == "8":
            bonus += 0.5
        elif role == "L" and original_char == "8" and candidate_char == "B":
            bonus -= 0.45
        elif role == "L" and original_char == "S" and candidate_char == "8":
            bonus -= 0.5
        elif role == "D" and original_char == "S" and candidate_char != "8":
            bonus -= 0.35
    return bonus


def resolve_8_s_plate_read(raw_text: str, compact: str | None = None) -> str:
    """Resolve 8/S/B confusion using plate layout roles."""
    base = _strip_noise(compact or raw_text)
    if not base or not any(char in base for char in "8S"):
        return base

    best = base
    best_score = -1.0
    for variant in _expand_8_s_variants(base):
        for corrected in {
            variant,
            _apply_role_corrections(variant),
            _format_known_layout(variant) or "",
            (_format_known_layout(variant) or "").replace("-", ""),
        }:
            key = _strip_noise(corrected)
            if not key:
                continue
            score = _layout_score(key) + _eight_s_disambiguation_bonus(raw_text, key)
            if score > best_score:
                best_score = score
                best = key
    return best


def _correct_uk_letter(char: str) -> str:
    """UK letter positions: 8/B are usually misread S (e.g. LS15 not L815)."""
    return _fix_letter_char(char)


def _looks_uk_ocr(compact: str) -> bool:
    """True when OCR likely read a UK plate (S-as-8 in second position, etc.)."""
    if UK_PLATE_COMPACT.match(compact):
        return True
    if len(compact) not in (6, 7, 8):
        return False
    if not (compact[0].isalpha() and compact[2:4].isdigit()):
        return False
    suffix = compact[4:]
    return bool(suffix.isalpha() and 2 <= len(suffix) <= 3 and compact[1] in "8B5")


def _recover_uk_candidates(raw: str) -> list[str]:
    """UK format AA##AAA — position-aware OCR fixes."""
    compact = _strip_noise(raw)
    if not compact or not _looks_uk_ocr(compact):
        return []

    suffix_len = len(compact) - 4
    if suffix_len not in (2, 3):
        return []

    recovered: set[str] = set()

    def build(letter_fix) -> str | None:
        chars = list(compact)
        chars[0] = letter_fix(chars[0])
        chars[1] = letter_fix(chars[1])
        chars[2] = _correct_numeric_segment(chars[2])
        chars[3] = _correct_numeric_segment(chars[3])
        for idx in range(4, len(chars)):
            chars[idx] = letter_fix(chars[idx])
        result = "".join(chars)
        return result if UK_PLATE_COMPACT.match(result) else None

    candidate = build(_correct_uk_letter)
    if candidate:
        recovered.add(candidate)

    # Direct 8 -> S at second letter when digits follow (L815xx -> LS15xx)
    if len(compact) >= 4 and compact[1] == "8" and compact[2:4].isdigit():
        recovered.add(compact[0] + "S" + compact[2:])

    return list(recovered)


def _is_european_not_uk_confusion(compact: str) -> bool:
    """Repeated digits after the first (e.g. K884) are European, not S-as-8 UK errors."""
    return bool(
        re.match(r"^[A-Z]\d{3}[A-Z]{2}$", compact)
        and len(compact) >= 4
        and compact[1].isdigit()
        and compact[1] == compact[2]
    )


def _uk_recovery_bonus(original: str, candidate: str) -> float:
    """Prefer minimal UK fixes; 8->S beats 8->B in letter positions."""
    orig = _strip_noise(original)
    cand = _strip_noise(candidate)
    if not UK_PLATE_COMPACT.match(cand) or len(orig) < 6 or len(cand) < 6:
        return 0.0

    if _is_european_not_uk_confusion(orig):
        return 0.0

    bonus = 0.25
    letter_slots = {0, 1, *range(4, len(cand))}
    for idx in letter_slots:
        if idx >= len(orig) or idx >= len(cand):
            continue
        if orig[idx] == cand[idx]:
            continue
        if orig[idx] == "8" and cand[idx] == "S":
            bonus += 0.35
        elif orig[idx] == "8" and cand[idx] == "B":
            bonus -= 0.3
        elif orig[idx] in "01IL" and cand[idx].isalpha():
            bonus += 0.1
    return bonus


def _trim_ocr_variants(raw: str) -> list[str]:
    """Drop common leading/trailing OCR noise (e.g. extra L/J/I)."""
    s = _strip_noise(raw)
    if not s:
        return []

    variants = {s}
    if len(s) >= 6 and s[0] in {"L", "J", "I", "1"}:
        variants.add(s[1:])
    if len(s) >= 6 and s[-1] in {"L", "J", "I", "1"}:
        variants.add(s[:-1])
    if len(s) >= 7:
        variants.add(s[1:])
        variants.add(s[:-1])
    return list(variants)


def _layout_score(compact: str) -> float:
    if is_indian_plate(compact):
        return 4.5
    if is_indian_plate_partial(compact):
        return 3.5
    if re.match(r"^[A-Z]\d{3}[A-Z]{2}$", compact):
        return 4.0
    if re.match(r"^\d{2}[A-Z]{2}\d{2}$", compact):
        return 4.0
    if UK_PLATE_COMPACT.match(compact):
        return 4.2
    if re.match(r"^[A-Z]{2}\d{3}[A-Z]{2}$", compact):
        return 3.5
    if re.match(r"^[A-Z]{2}\d{5,6}$", compact):
        return 3.0
    if re.match(r"^[A-Z0-9]{5,8}$", compact):
        return 1.5
    return 0.0


def _generate_candidates(raw: str) -> list[str]:
    s = _strip_noise(raw)
    if not s:
        return []

    candidates = {s}
    for trimmed in _trim_ocr_variants(s):
        candidates.add(trimmed)

    formatted = _format_known_layout(s)
    if formatted:
        candidates.add(formatted.replace("-", ""))
        candidates.add(formatted)

    for indian in _recover_indian_candidates(s):
        candidates.add(indian)
        layout = _format_indian_plate(indian)
        if layout:
            candidates.add(layout)

    for uk in _recover_uk_candidates(s):
        candidates.add(uk)
        layout = _format_known_layout(uk)
        if layout:
            candidates.add(layout)
            candidates.add(layout.replace("-", ""))

    for variant in list(candidates):
        for eight_s_variant in _expand_8_s_variants(variant):
            candidates.add(eight_s_variant)
            candidates.add(_apply_role_corrections(eight_s_variant))

    # Fix OCR confusion using common plate layouts
    if len(s) == 6 and not re.match(r"^[A-Z]{2}\d{2}[A-Z]{2}$", s):
        chars = list(s)
        chars[0] = _correct_letter_segment(chars[0])
        for idx in (1, 2, 3):
            chars[idx] = _correct_numeric_segment(chars[idx])
        for idx in (4, 5):
            chars[idx] = _correct_letter_segment(chars[idx])
        candidates.add("".join(chars))

    if len(s) >= 9 and re.match(r"^[A-Z]{1,2}\d{2}[A-Z]", s):
        chars = list(s)
        for idx in (0, 1):
            if idx < len(chars):
                chars[idx] = _correct_letter_segment(chars[idx])
        for idx in (2, 3):
            if idx < len(chars):
                chars[idx] = _correct_numeric_segment(chars[idx])
        series_end = len(chars) - 4
        for idx in range(4, series_end):
            chars[idx] = _correct_letter_segment(chars[idx])
        for idx in range(series_end, len(chars)):
            chars[idx] = _correct_numeric_segment(chars[idx])
        corrected = "".join(chars)
        candidates.add(corrected)
        for indian in _recover_indian_candidates(corrected):
            candidates.add(indian)
    elif len(s) >= 6 and not UK_PLATE_COMPACT.match(s):
        middle = list(s)
        for idx, ch in enumerate(middle):
            if idx == 0 or idx >= len(middle) - 2:
                middle[idx] = _correct_letter_segment(ch)
            else:
                middle[idx] = _correct_numeric_segment(ch)
        candidates.add("".join(middle))

    expanded: set[str] = set()
    for candidate in candidates:
        expanded.add(candidate)
        layout = _format_known_layout(candidate)
        if layout:
            expanded.add(layout)
        for trimmed in _trim_ocr_variants(candidate):
            expanded.add(trimmed)
            layout = _format_known_layout(trimmed)
            if layout:
                expanded.add(layout)

    return list(expanded)


def is_valid_plate(text: str) -> bool:
    if not text or text in {"UNKNOWN", "UNREADABLE", "REJECTED"}:
        return False
    normalized = text.upper().strip()
    dashed_patterns = PLATE_PATTERNS
    compact_patterns = [
        UK_PLATE_COMPACT,
        re.compile(r"^[A-Z]\d{3}[A-Z]{2}$"),
        re.compile(r"^\d{2}[A-Z]{2}\d{2}$"),
        re.compile(r"^[A-Z]{2}\d{3}[A-Z]{2}$"),
        re.compile(r"^[A-Z]{2}\d{5,6}$"),
        re.compile(r"^[A-Z0-9]{5,8}$"),
        INDIAN_PLATE_COMPACT,
    ]
    return any(pattern.match(normalized) for pattern in [*dashed_patterns, *compact_patterns])


def normalize_plate_text(raw_text: str, confidence: float = 0.85) -> dict[str, Any]:
    simple = clean_plate_text(raw_text)
    candidates = _generate_candidates(raw_text)
    if simple:
        candidates.append(simple)
    best_text = ""
    best_score = -1.0

    for candidate in candidates:
        formatted = _format_known_layout(candidate) or candidate
        compact = formatted.replace("-", "")
        valid = is_valid_plate(formatted)
        layout_bonus = _layout_score(compact)
        indian = is_indian_plate(compact)
        partial_indian = is_indian_plate_partial(compact)
        edge_noise = compact[-1] in {"L", "J", "I"} if compact else False
        trimmed = compact[:-1] if edge_noise and len(compact) >= 6 else ""
        trimmed_valid = bool(trimmed and is_valid_plate(_format_known_layout(trimmed) or trimmed))
        noise_penalty = 0.0 if (indian or partial_indian) else (0.6 if edge_noise and trimmed_valid else 0.0)
        length_penalty = 0.0 if (indian or partial_indian) else max(0, len(compact) - 7) * 0.15
        if indian or partial_indian:
            recovery_bonus = _indian_recovery_bonus(raw_text, compact)
        elif UK_PLATE_COMPACT.match(compact):
            recovery_bonus = _uk_recovery_bonus(raw_text, compact)
        else:
            recovery_bonus = 0.0
        eight_s_bonus = _eight_s_disambiguation_bonus(raw_text, compact)
        exact_read_bonus = 0.55 if _strip_noise(raw_text) == compact else 0.0
        raw_compact = _strip_noise(raw_text)
        european_exact = 0.0
        if raw_compact == compact and re.match(r"^[A-Z]\d{3}[A-Z]{2}$", compact):
            if _is_european_not_uk_confusion(compact) or not _recover_uk_candidates(raw_text):
                european_exact = 0.8
        score = (
            (2.0 if valid else 0.5)
            + confidence
            + layout_bonus
            + recovery_bonus
            + eight_s_bonus
            + exact_read_bonus
            + european_exact
            + min(len(compact), 10) * 0.02
            - noise_penalty
            - length_penalty
        )
        if score > best_score:
            best_score = score
            best_text = formatted

    if not best_text:
        cleaned = clean_plate_text(raw_text) or _strip_noise(raw_text)
        best_text = cleaned or "UNKNOWN"

    display_text = _strip_noise(best_text)
    if not display_text or display_text == "UNKNOWN":
        return {
            "raw_text": raw_text,
            "cleaned_text": "REJECTED",
            "confidence": confidence,
            "char_confidences": [],
            "is_valid": False,
            "detection_quality": "rejected",
        }

    letters = sum(1 for char in display_text if char.isalpha())
    digits = sum(1 for char in display_text if char.isdigit())
    looks_like_plate = (
        is_indian_plate(display_text)
        or is_indian_plate_partial(display_text)
        or (5 <= len(display_text) <= 8 and letters >= 2 and digits >= 2)
    )

    if not looks_like_plate and not is_valid_plate(display_text):
        return {
            "raw_text": raw_text,
            "cleaned_text": "REJECTED",
            "confidence": confidence,
            "char_confidences": [],
            "is_valid": False,
            "detection_quality": "rejected",
        }

    return {
        "raw_text": raw_text,
        "cleaned_text": display_text,
        "confidence": confidence,
        "char_confidences": [confidence] * max(len(display_text), 1),
        "is_valid": is_valid_plate(display_text),
        "detection_quality": (
            "good"
            if confidence >= 0.8 and is_valid_plate(display_text)
            else "fair"
            if looks_like_plate
            else "rejected"
        ),
    }
