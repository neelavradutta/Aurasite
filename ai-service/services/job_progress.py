import threading
from typing import Any

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def create_job(job_id: str, max_frames: int | None = None) -> None:
    with _lock:
        if job_id in _jobs:
            return
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "processing",
            "frames_processed": 0,
            "max_frames": max_frames or 0,
            "progress": 0,
            "result": None,
            "error": None,
        }


def update_frames(job_id: str, frames_processed: int, max_frames: int) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["frames_processed"] = frames_processed
        job["max_frames"] = max_frames
        if max_frames > 0:
            job["progress"] = min(90, int((frames_processed / max_frames) * 90))
        else:
            job["progress"] = 0


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["status"] = "completed"
        job["progress"] = 100
        job["frames_processed"] = result.get("frames_processed", job["frames_processed"])
        job["max_frames"] = result.get("max_frames", job["max_frames"])
        job["result"] = result


def fail_job(job_id: str, error: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["status"] = "failed"
        job["error"] = error


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None
