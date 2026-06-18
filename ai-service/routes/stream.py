import time
import uuid

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from services.anpr_pipeline import AnprPipeline
from services.streaming_service import stream_manager

router = APIRouter(prefix="/api/v1/stream", tags=["stream"])

_live_pipelines: dict[str, AnprPipeline] = {}


class StreamStartRequest(BaseModel):
    stream_url: str = Field(..., description="RTSP, HTTP, or file URL")
    stream_id: str | None = None
    options: dict | None = None


@router.post("/start")
async def start_stream(body: StreamStartRequest):
    stream_id = body.stream_id or str(uuid.uuid4())
    result = stream_manager.start(stream_id, body.stream_url, body.options)
    return {"success": True, "data": result, "message": "Stream started"}


class StreamStopRequest(BaseModel):
    stream_id: str


@router.post("/stop")
async def stop_stream(body: StreamStopRequest):
    result = stream_manager.stop(body.stream_id)
    return {"success": True, "data": result, "message": "Stream stopped"}


@router.get("/status")
async def stream_status():
    return {"success": True, "data": stream_manager.status()}


class LiveDetectStopRequest(BaseModel):
    session_id: str


LIVE_PLATE_CONFIDENCE = 0.25
LIVE_MIN_PLATE_CONFIDENCE = 0.55


@router.post("/detect/stop")
async def stop_live_detect(body: LiveDetectStopRequest):
    _live_pipelines.pop(body.session_id, None)
    return {"success": True, "data": {"session_id": body.session_id, "status": "stopped"}}


@router.post("/detect")
async def detect_live_frame(
    frame: UploadFile = File(...),
    frame_number: int = Form(0),
    timestamp: float = Form(0),
    session_id: str = Form("default"),
):
    raw = await frame.read()
    if not raw:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "empty_frame", "message": "Frame payload is empty"},
        )

    np_frame = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(np_frame, cv2.IMREAD_COLOR)
    if image is None:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "invalid_frame", "message": "Could not decode frame image"},
        )

    pipeline = _live_pipelines.get(session_id)
    if pipeline is None:
        pipeline = AnprPipeline()
        _live_pipelines[session_id] = pipeline

    ts = timestamp or time.time()
    detections = pipeline.process_frame_detections(
        image,
        frame_number,
        ts,
        plate_confidence_threshold=LIVE_PLATE_CONFIDENCE,
        min_plate_confidence=LIVE_MIN_PLATE_CONFIDENCE,
        force_detection=True,
    )

    cleaned = [{k: v for k, v in item.items() if k != "_score"} for item in detections]

    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "frame_number": frame_number,
            "detections": cleaned,
        },
    }


@router.get("/{stream_id}/frame")
async def latest_frame(stream_id: str):
    frame = stream_manager.get_latest_frame(stream_id)
    if not frame:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": "no_frame", "message": "No frame available"},
        )
    return Response(content=frame, media_type="image/jpeg")
