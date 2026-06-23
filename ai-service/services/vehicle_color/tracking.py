"""Temporal colour smoothing per vehicle track."""

from __future__ import annotations

from collections import defaultdict, deque

from services.vehicle_color.config import CONFIG

_history: dict[str, deque[tuple[str, float, float]]] = defaultdict(
    lambda: deque(maxlen=CONFIG.temporal_buffer_size)
)


def _hue_distance(left: str, right: str) -> float:
    order = ["Black", "Grey", "Silver", "White", "Brown", "Red", "Green", "Blue"]
    if left == right:
        return 0.0
    try:
        return abs(order.index(left) - order.index(right)) * 15.0
    except ValueError:
        return CONFIG.outlier_hue_delta


def update_track_color(track_id: str, color: str, confidence: float, hue: float) -> tuple[str, float]:
    buffer = _history[track_id]
    if buffer:
        stable = [entry for entry in buffer if _hue_distance(entry[0], color) <= CONFIG.outlier_hue_delta]
        if stable:
            buffer.clear()
            buffer.extend(stable)

    buffer.append((color, confidence, hue))

    votes: dict[str, float] = {}
    for idx, (name, conf, _) in enumerate(buffer):
        weight = conf * (1.0 + idx * 0.08)
        votes[name] = votes.get(name, 0.0) + weight

    best_name = max(votes, key=votes.get)
    best_conf = votes[best_name] / max(1.0, sum(votes.values()))
    return best_name, min(1.0, best_conf)


def reset_color_history() -> None:
    _history.clear()
