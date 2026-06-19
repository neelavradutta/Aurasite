import logging
import time
from typing import Any, Callable

import cv2
import numpy as np

from config.settings import settings
from services.anpr_pipeline import AnprPipeline
from services import batch_context
from services.plate_consolidation import consolidate_video_plates
from services.video_plate_processing import pick_best_video_dashboard_plates, refine_video_plate_read
from services.plate_quality import plate_key

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, int], None]

# Match live-feed sensitivity: many real plates score below the default 0.35 cutoff.
VIDEO_PLATE_CONFIDENCE = 0.25
VIDEO_MIN_PLATE_CONFIDENCE = 0.64


def is_high_resolution_video(width: int, height: int) -> bool:
    return int(height or 0) >= 1440 or int(width or 0) >= 2560


def resolve_max_frames(max_frames: int | None) -> int:
    limit = int(max_frames) if max_frames else settings.max_frames
    return max(1, limit)


def _open_video_capture(video_path: str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        cap = cv2.VideoCapture(video_path)
    return cap


def _safe_read_frame(cap: cv2.VideoCapture) -> tuple[bool, np.ndarray | None]:
    try:
        ret, frame = cap.read()
        if not ret or frame is None:
            return False, None
        return True, frame
    except cv2.error as exc:
        logger.warning("OpenCV frame read failed: %s", exc)
        return False, None
    except Exception as exc:
        logger.warning("Unexpected frame read failure: %s", exc)
        return False, None


def _safe_seek_frame(cap: cv2.VideoCapture, frame_id: int) -> bool:
    try:
        return bool(cap.set(cv2.CAP_PROP_POS_FRAMES, frame_id))
    except cv2.error as exc:
        logger.warning("OpenCV seek failed at frame %s: %s", frame_id, exc)
        return False
    except Exception as exc:
        logger.warning("Unexpected seek failure at frame %s: %s", frame_id, exc)
        return False


def _read_sampled_frames_sequential(
    cap: cv2.VideoCapture,
    sample_indices: list[int],
    fps: float,
    downscale_half: bool,
    pipeline: AnprPipeline,
    *,
    frame_skip: int,
    confidence_threshold: float,
    progress_callback: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], int, set[str]]:
    """Sequential decode — avoids broken frame seeks on 4K/H.265 MP4 files."""
    targets = sorted({max(0, int(index)) for index in sample_indices})
    if not targets:
        return [], 0, set()

    target_set = set(targets)
    max_target = targets[-1]
    detections: list[dict[str, Any]] = []
    unique_tracks: set[str] = set()
    processed = 0
    frame_id = 0

    while frame_id <= max_target:
        ret, frame = _safe_read_frame(cap)
        if not ret:
            break

        if frame_id in target_set:
            if downscale_half:
                frame = cv2.resize(frame, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)

            timestamp = round(frame_id / fps, 3) if fps else 0.0
            frame_results = pipeline.process_frame_detections(
                frame,
                frame_id,
                timestamp,
                confidence_threshold=confidence_threshold,
                min_plate_confidence=VIDEO_MIN_PLATE_CONFIDENCE,
                plate_confidence_threshold=VIDEO_PLATE_CONFIDENCE,
            )

            for item in frame_results:
                track_id = item.get("track_id", f"track_{frame_id}")
                unique_tracks.add(str(track_id))
                detections.append(
                    {**item, "is_repeat_detection": False, "pipeline_mode": "video_batch"}
                )

            processed += 1
            if progress_callback:
                progress_callback(processed, len(targets))
            if processed >= len(targets):
                break

        frame_id += 1

    return detections, processed, unique_tracks


def compute_frame_sample_indices(total_frames: int, max_frames: int) -> list[int]:
    """Spread sample points evenly across the video — decode only max_frames frames."""
    max_frames = max(1, int(max_frames))
    if total_frames <= 0:
        return [index * settings.frame_skip for index in range(max_frames)]

    if total_frames <= max_frames:
        return list(range(total_frames))

    step = max(1, total_frames // max_frames)
    return [min(index * step, total_frames - 1) for index in range(max_frames)]


def adapt_video_processing(
    total_frames: int,
    fps: float,
    width: int,
    height: int,
    frame_skip: int,
    max_frames: int,
) -> tuple[int, bool]:
    """≥1440p: 0.5x downscale. Frame sampling is handled separately."""
    width = int(width or 1920)
    height = int(height or 1080)

    if is_high_resolution_video(width, height):
        logger.info(
            "1440p+ video (%dx%d): downscale 0.5x, sampling %d frames",
            width,
            height,
            max_frames,
        )
        return max_frames, True

    if height <= 1080:
        return max_frames, False

    return max_frames, False


def _prepare_live_frame(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    longest = max(height, width)
    target = 1280 if longest > 1280 else longest
    if longest > target:
        scale = target / longest
        frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    if longest < 960:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
        l_channel = clahe.apply(l_channel)
        frame = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    return frame


class VideoProcessor:
    def __init__(self):
        self.pipeline = AnprPipeline()

    def process_video(
        self,
        video_path: str,
        frame_skip: int = 2,
        confidence_threshold: float = 0.5,
        min_plate_confidence: float = 0.7,
        max_frames: int | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        start = time.time()
        cap = _open_video_capture(video_path)
        if not cap.isOpened():
            raise ValueError("invalid_video_format")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
        max_frames = resolve_max_frames(max_frames)
        target_frames, downscale_half = adapt_video_processing(
            total_frames, fps, width, height, frame_skip, max_frames
        )
        sample_indices = compute_frame_sample_indices(total_frames, target_frames)
        use_sequential_read = is_high_resolution_video(width, height)

        logger.info(
            "Video batch: total_frames=%s, sampling=%s indices, max_frames=%s, sequential=%s",
            total_frames,
            len(sample_indices),
            target_frames,
            use_sequential_read,
        )

        batch_context.set_video_mode()
        self.pipeline.reset()
        # Run YOLO every N sampled frames (dashboard sends frame_skip: 3).
        self.pipeline.detection_interval = max(1, frame_skip or settings.video_detection_interval)

        detections: list[dict[str, Any]] = []
        processed = 0
        unique_tracks: set[str] = set()

        if progress_callback:
            progress_callback(0, len(sample_indices))

        try:
            if use_sequential_read:
                detections, processed, unique_tracks = _read_sampled_frames_sequential(
                    cap,
                    sample_indices,
                    fps,
                    downscale_half,
                    self.pipeline,
                    frame_skip=frame_skip,
                    confidence_threshold=confidence_threshold,
                    progress_callback=progress_callback,
                )
            else:
                for frame_id in sample_indices:
                    if total_frames > 0:
                        _safe_seek_frame(cap, frame_id)
                    ret, frame = _safe_read_frame(cap)
                    if not ret or frame is None:
                        continue

                    if downscale_half:
                        frame = cv2.resize(frame, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)

                    timestamp = round(frame_id / fps, 3)
                    frame_results = self.pipeline.process_frame_detections(
                        frame,
                        frame_id,
                        timestamp,
                        confidence_threshold=confidence_threshold,
                        min_plate_confidence=VIDEO_MIN_PLATE_CONFIDENCE,
                        plate_confidence_threshold=VIDEO_PLATE_CONFIDENCE,
                    )

                    for item in frame_results:
                        track_id = item.get("track_id", f"track_{frame_id}")
                        unique_tracks.add(str(track_id))
                        detections.append(
                            {**item, "is_repeat_detection": False, "pipeline_mode": "video_batch"}
                        )

                    processed += 1
                    if progress_callback:
                        progress_callback(processed, len(sample_indices))
        finally:
            batch_context.clear_media_mode()
            cap.release()

        if processed == 0:
            raise ValueError(
                "video_decode_failed: OpenCV could not read frames from this file. "
                "Try re-encoding to H.264 MP4 or use a smaller 1080p clip."
            )

        elapsed = time.time() - start

        for record in detections:
            if record.get("pipeline_mode") != "video_batch":
                continue
            plate_number = str(record.get("plate_number", ""))
            confidence = float(record.get("plate", {}).get("confidence", 0.85))
            refined = refine_video_plate_read(plate_number, confidence)
            record["plate_number"] = refined.get("cleaned_text", plate_number)
            plate = record.get("plate")
            if isinstance(plate, dict):
                plate["cleaned_text"] = record["plate_number"]

        detections = consolidate_video_plates(detections)
        log_records = [{k: v for k, v in d.items() if k != "_score"} for d in detections]
        unique_accepted = pick_best_video_dashboard_plates(detections)
        unique_plates = {plate_key(str(d.get("plate_number", ""))) for d in unique_accepted}

        return {
            "total_frames": total_frames or processed,
            "frames_processed": processed,
            "max_frames": len(sample_indices),
            "total_detections": len(log_records),
            "unique_vehicles": len(unique_plates) or len(unique_tracks),
            "unique_plates": len(unique_plates),
            "processing_time_seconds": round(elapsed, 2),
            "fps": round(processed / elapsed, 2) if elapsed > 0 else 0,
            "detections": log_records,
            "dashboard_plates": unique_accepted,
            "media_type": "video",
            "detection_pipeline": "video_batch",
        }

    def process_frame(self, frame_bytes: bytes, frame_number: int, timestamp: float) -> dict[str, Any]:
        from services.batch_context import clear_live_mode, set_live_mode

        start = time.time()
        arr = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("invalid_frame")

        set_live_mode()
        try:
            frame = _prepare_live_frame(frame)
            result = self.pipeline.process_single_frame(frame, frame_number, timestamp, live_mode=True)
            result["processing_time_ms"] = round((time.time() - start) * 1000, 2)
            return result
        finally:
            clear_live_mode()


def initialize_models():
    from services.anpr_pipeline import initialize_models as init

    init()
