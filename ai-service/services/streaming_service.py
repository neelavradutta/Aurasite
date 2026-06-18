import logging
import threading
import time
from typing import Any

import cv2
import httpx

from config.settings import settings
from services.anpr_pipeline import AnprPipeline

logger = logging.getLogger(__name__)

_active_streams: dict[str, dict[str, Any]] = {}
_stop_flags: dict[str, threading.Event] = {}
_latest_frames: dict[str, bytes] = {}


class StreamManager:
    def start(self, stream_id: str, stream_url: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        if stream_id in _active_streams:
            return {"stream_id": stream_id, "status": "already_running"}

        opts = options or {}
        stop_event = threading.Event()
        _stop_flags[stream_id] = stop_event

        thread = threading.Thread(
            target=self._run_stream,
            args=(stream_id, stream_url, stop_event, opts),
            daemon=True,
        )
        thread.start()

        _active_streams[stream_id] = {
            "stream_id": stream_id,
            "stream_url": stream_url,
            "status": "running",
            "started_at": time.time(),
            "frames_processed": 0,
            "detections_sent": 0,
        }

        return _active_streams[stream_id]

    def stop(self, stream_id: str) -> dict[str, Any]:
        event = _stop_flags.get(stream_id)
        if event:
            event.set()
        _active_streams.pop(stream_id, None)
        _stop_flags.pop(stream_id, None)
        _latest_frames.pop(stream_id, None)
        return {"stream_id": stream_id, "status": "stopped"}

    def status(self) -> dict[str, Any]:
        return {
            "active_streams": len(_active_streams),
            "streams": list(_active_streams.values()),
        }

    def get_latest_frame(self, stream_id: str) -> bytes | None:
        return _latest_frames.get(stream_id)

    def _run_stream(self, stream_id: str, stream_url: str, stop_event: threading.Event, options: dict[str, Any]):
        pipeline = AnprPipeline()
        frame_skip = int(options.get("frame_skip", settings.frame_skip))
        interval = float(options.get("frame_interval", settings.stream_frame_interval))
        callback_url = f"{settings.backend_callback_url.rstrip('/')}/api/v1/stream/update"

        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            logger.error("Failed to open stream %s", stream_url)
            if stream_id in _active_streams:
                _active_streams[stream_id]["status"] = "error"
            return

        frame_id = 0
        last_emit = 0.0

        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                time.sleep(1)
                cap.release()
                cap = cv2.VideoCapture(stream_url)
                continue

            _, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            _latest_frames[stream_id] = jpeg.tobytes()

            if frame_id % frame_skip == 0:
                now = time.time()
                if now - last_emit >= interval:
                    self._process_and_callback(pipeline, frame, frame_id, now, callback_url, stream_id)
                    last_emit = now

            frame_id += 1
            if stream_id in _active_streams:
                _active_streams[stream_id]["frames_processed"] = frame_id

            time.sleep(0.01)

        cap.release()
        logger.info("Stream %s stopped", stream_id)

    def _process_and_callback(
        self,
        pipeline: AnprPipeline,
        frame,
        frame_id: int,
        timestamp: float,
        callback_url: str,
        stream_id: str,
    ):
        try:
            results = pipeline.process_frame_detections(frame, frame_id, timestamp)
            for payload in results:
                payload["stream_id"] = stream_id
                try:
                    httpx.post(callback_url, json=payload, timeout=5.0)
                    if stream_id in _active_streams:
                        _active_streams[stream_id]["detections_sent"] += 1
                except Exception as exc:
                    logger.warning("Callback failed: %s", exc)
        except Exception as exc:
            logger.exception("Stream frame processing failed: %s", exc)


stream_manager = StreamManager()
