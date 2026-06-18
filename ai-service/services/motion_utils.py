import cv2
import numpy as np


def motion_score(previous_gray: np.ndarray | None, current_gray: np.ndarray) -> float:
    if previous_gray is None or previous_gray.shape != current_gray.shape:
        return 0.0
    return float(np.mean(cv2.absdiff(previous_gray, current_gray)))


def prepare_motion_frame(frame: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    scale = 640 / max(w, 1)
    if scale < 1.0:
        gray = cv2.resize(gray, (640, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return gray
