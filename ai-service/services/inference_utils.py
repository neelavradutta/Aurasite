"""YOLO inference sizing for high-resolution video frames."""

from services.batch_context import is_live_mode


def yolo_imgsz(frame_shape: tuple[int, ...]) -> int:
    h, w = frame_shape[:2]
    longest = max(h, w)
    if is_live_mode():
        if longest >= 1280:
            return 640
        if longest >= 960:
            return 544
        return 480
    if longest >= 2560:
        return 1280
    if longest >= 1920:
        return 960
    if longest >= 1280:
        return 768
    return 640
