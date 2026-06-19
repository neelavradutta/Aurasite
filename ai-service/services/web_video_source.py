"""Resolve public internet video links and cache capture sessions for live polling."""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import cv2
import numpy as np

logger = logging.getLogger(__name__)

DIRECT_MEDIA_SUFFIXES = (
    ".mp4",
    ".webm",
    ".mkv",
    ".avi",
    ".mov",
    ".m4v",
    ".wmv",
    ".flv",
    ".m3u8",
    ".mpd",
)

SESSION_TTL_SEC = 180

# Page links from these hosts are downloaded first — direct CDN URLs often fail in OpenCV.
DOWNLOAD_FIRST_HOSTS = (
    "youtube.com",
    "youtu.be",
    "facebook.com",
    "fb.watch",
    "instagram.com",
)


@dataclass
class _CaptureSession:
    capture: cv2.VideoCapture
    last_used: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)
    cleanup_paths: list[str] = field(default_factory=list)


_sessions: dict[str, _CaptureSession] = {}
_registry_lock = threading.Lock()


def is_internet_url(source: str) -> bool:
    value = source.strip().lower()
    return value.startswith(("http://", "https://"))


def _is_direct_media_url(source: str) -> bool:
    path = urlparse(source.strip()).path.lower()
    return any(path.endswith(ext) for ext in DIRECT_MEDIA_SUFFIXES)


def _session_key(source: str) -> str:
    return source.strip()


def _open_capture(play_target: str | int) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(play_target, cv2.CAP_FFMPEG)
    if not cap.isOpened() and isinstance(play_target, str):
        cap = cv2.VideoCapture(play_target)
    return cap


def _host_matches(url: str, hosts: tuple[str, ...]) -> bool:
    host = urlparse(url.strip()).netloc.lower().removeprefix("www.")
    return any(host == candidate or host.endswith(f".{candidate}") for candidate in hosts)


def _pick_stream_url(info: dict[str, Any]) -> str | None:
    direct = info.get("url")
    if isinstance(direct, str) and direct:
        return direct

    for fmt in reversed(info.get("formats") or []):
        url = fmt.get("url")
        if not url:
            continue
        if fmt.get("vcodec") == "none":
            continue
        return url
    return None


def _base_ydl_opts() -> dict[str, Any]:
    return {
        "format": "best[ext=mp4]/best[ext=webm]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
    }


def _download_with_yt_dlp(url: str) -> tuple[str, list[str]]:
    import yt_dlp

    temp_dir = tempfile.mkdtemp(prefix="anpr_webvid_")
    download_opts = {
        **_base_ydl_opts(),
        "outtmpl": os.path.join(temp_dir, "video.%(ext)s"),
    }

    try:
        with yt_dlp.YoutubeDL(download_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise ValueError("unsupported_link")
            filepath = ydl.prepare_filename(info)
            if not os.path.isfile(filepath):
                raise ValueError("unsupported_link")
            return filepath, [temp_dir]
    except ValueError:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.warning("yt-dlp download failed for %s: %s", url, exc)
        raise ValueError("unsupported_link") from exc


def _extract_stream_with_yt_dlp(url: str) -> str | None:
    import yt_dlp

    with yt_dlp.YoutubeDL(_base_ydl_opts()) as ydl:
        info = ydl.extract_info(url, download=False)
        if info is None:
            raise ValueError("unsupported_link")

        if info.get("entries"):
            entries = [entry for entry in info["entries"] if entry]
            if not entries:
                raise ValueError("unsupported_link")
            info = ydl.extract_info(entries[0].get("url") or entries[0].get("webpage_url"), download=False)
            if info is None:
                raise ValueError("unsupported_link")

        return _pick_stream_url(info)


def _resolve_with_yt_dlp(url: str) -> tuple[str, list[str]]:
    try:
        import yt_dlp  # noqa: F401
    except ImportError as exc:
        raise ValueError("web_video_unavailable") from exc

    if _host_matches(url, DOWNLOAD_FIRST_HOSTS):
        return _download_with_yt_dlp(url)

    try:
        stream_url = _extract_stream_with_yt_dlp(url)
        if stream_url:
            return stream_url, []
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("yt-dlp stream extract failed for %s: %s", url, exc)

    return _download_with_yt_dlp(url)


def _resolve_play_target(source: str) -> tuple[str | int, list[str]]:
    raw = source.strip()
    if raw.isdigit():
        return int(raw), []

    if is_internet_url(raw) and not _is_direct_media_url(raw):
        return _resolve_with_yt_dlp(raw)

    return raw, []


def _cleanup_session(session: _CaptureSession) -> None:
    try:
        session.capture.release()
    except Exception:
        pass

    for path in session.cleanup_paths:
        try:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
            elif os.path.isfile(path):
                os.remove(path)
        except Exception:
            pass


def _evict_stale_sessions() -> None:
    now = time.time()
    stale_keys = [key for key, session in _sessions.items() if now - session.last_used > SESSION_TTL_SEC]
    for key in stale_keys:
        session = _sessions.pop(key, None)
        if session:
            _cleanup_session(session)


def _create_session(source: str) -> _CaptureSession:
    raw = source.strip()
    play_target, cleanup_paths = _resolve_play_target(source)
    cap = _open_capture(play_target)

    if not cap.isOpened() and is_internet_url(raw) and not _is_direct_media_url(raw):
        cap.release()
        for path in cleanup_paths:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
        play_target, cleanup_paths = _download_with_yt_dlp(raw)
        cap = _open_capture(play_target)

    if not cap.isOpened():
        for path in cleanup_paths:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
        raise ValueError("source_unavailable")

    return _CaptureSession(capture=cap, cleanup_paths=cleanup_paths)


def read_live_source_frame(source: str) -> tuple[bool, np.ndarray | None]:
    key = _session_key(source)

    with _registry_lock:
        _evict_stale_sessions()
        session = _sessions.get(key)
        if session is None:
            session = _create_session(source)
            _sessions[key] = session

    with session.lock:
        session.last_used = time.time()
        ok, frame = session.capture.read()
        if not ok or frame is None:
            with _registry_lock:
                stale = _sessions.pop(key, None)
            if stale:
                _cleanup_session(stale)
            return False, None
        return True, frame


def release_live_source(source: str) -> None:
    key = _session_key(source)
    with _registry_lock:
        session = _sessions.pop(key, None)
    if session:
        _cleanup_session(session)
