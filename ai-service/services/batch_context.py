"""Runtime flags for image vs video detection (avoid circular imports)."""

VIDEO_BATCH = False
IMAGE_SINGLE = False
LIVE_MODE = False
MEDIA_MODE = "none"  # "video" | "image" | "none"


def set_live_mode() -> None:
    global LIVE_MODE
    LIVE_MODE = True


def clear_live_mode() -> None:
    global LIVE_MODE
    LIVE_MODE = False


def is_live_mode() -> bool:
    return LIVE_MODE


def set_video_mode() -> None:
    global VIDEO_BATCH, IMAGE_SINGLE, MEDIA_MODE
    VIDEO_BATCH = True
    IMAGE_SINGLE = False
    MEDIA_MODE = "video"


def set_image_mode() -> None:
    global VIDEO_BATCH, IMAGE_SINGLE, MEDIA_MODE
    VIDEO_BATCH = False
    IMAGE_SINGLE = True
    MEDIA_MODE = "image"


def clear_media_mode() -> None:
    global VIDEO_BATCH, IMAGE_SINGLE, MEDIA_MODE
    VIDEO_BATCH = False
    IMAGE_SINGLE = False
    MEDIA_MODE = "none"


def is_video_mode() -> bool:
    return MEDIA_MODE == "video"


def is_image_mode() -> bool:
    return MEDIA_MODE == "image"
