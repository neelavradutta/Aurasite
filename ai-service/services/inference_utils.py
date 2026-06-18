"""YOLO inference sizing for high-resolution video frames."""


def yolo_imgsz(frame_shape: tuple[int, ...]) -> int:
    h, w = frame_shape[:2]
    longest = max(h, w)
    if longest >= 2560:
        return 1280
    if longest >= 1920:
        return 960
    if longest >= 1280:
        return 768
    return 640
