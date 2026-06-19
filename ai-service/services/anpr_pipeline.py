import logging
from typing import Any

import cv2
import numpy as np

from config.settings import settings
from services.detection_service import detect_vehicles
from services.plate_detection_service import detect_plates, is_plate_model_ready
from services.plate_extractor import extract_plate_record
from services.tracker import ByteTracker

logger = logging.getLogger(__name__)


def _center(bbox: list[int]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def _calculate_iou(left_box: list[int], right_box: list[int]) -> float:
    lx1, ly1, lx2, ly2 = left_box
    rx1, ry1, rx2, ry2 = right_box

    inter_x1 = max(lx1, rx1)
    inter_y1 = max(ly1, ry1)
    inter_x2 = min(lx2, rx2)
    inter_y2 = min(ly2, ry2)

    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0

    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    left_area = max(1, (lx2 - lx1) * (ly2 - ly1))
    right_area = max(1, (rx2 - rx1) * (ry2 - ry1))
    union_area = left_area + right_area - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


def _associate_vehicle(plate_bbox: list[int], vehicles: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not vehicles:
        return None

    pc = _center(plate_bbox)
    best_match = None
    best_score = -1.0

    for vehicle in vehicles:
        bbox = vehicle["bbox"]
        center_inside = bbox[0] <= pc[0] <= bbox[2] and bbox[1] <= pc[1] <= bbox[3]
        overlap = _calculate_iou(plate_bbox, bbox)
        score = float(vehicle.get("confidence", 0)) + overlap
        if center_inside:
            score += 1.0
        if score > best_score:
            best_score = score
            best_match = vehicle

    return best_match


def _live_detect_plates(
    frame: np.ndarray,
    plate_conf: float,
    min_plate_area: int,
    frame_id: int,
) -> list[dict[str, Any]]:
    detections = detect_plates(frame, plate_conf, min_plate_area=min_plate_area, max_det=6)
    if detections or frame_id % 4 != 0:
        return detections

    height, width = frame.shape[:2]
    margin_x = int(width * 0.10)
    margin_y = int(height * 0.08)
    crop = frame[margin_y : height - margin_y, margin_x : width - margin_x]
    if crop.size == 0:
        return []

    crop_up = cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_LINEAR)
    crop_conf = max(plate_conf * 0.85, 0.08)
    crop_dets = detect_plates(crop_up, crop_conf, min_plate_area=80, max_det=4)
    mapped: list[dict[str, Any]] = []
    scale = 1.5
    for det in crop_dets:
        x1, y1, x2, y2 = det["bbox"]
        mapped.append(
            {
                **det,
                "bbox": [
                    int(x1 / scale + margin_x),
                    int(y1 / scale + margin_y),
                    int(x2 / scale + margin_x),
                    int(y2 / scale + margin_y),
                ],
            }
        )
    return mapped


class AnprPipeline:
    def __init__(self):
        self.reset()

    def reset(self) -> None:
        track_buffer = settings.track_buffer
        match_iou = settings.track_match_iou
        track_thresh = settings.track_thresh
        self.vehicle_tracker = ByteTracker(
            max_age=track_buffer,
            iou_threshold=match_iou,
            track_thresh=track_thresh,
        )
        self.plate_tracker = ByteTracker(
            max_age=max(12, track_buffer // 2),
            iou_threshold=match_iou,
            track_thresh=settings.plate_confidence_threshold,
        )
        self.detection_interval = max(1, settings.detection_interval)
        self._processed_count = 0

    def _should_run_yolo(self, force_detection: bool) -> bool:
        if force_detection:
            return True
        if self._processed_count == 0:
            return True
        return self._processed_count % self.detection_interval == 0

    def process_frame_detections(
        self,
        frame: np.ndarray,
        frame_id: int,
        timestamp: float,
        confidence_threshold: float | None = None,
        min_plate_confidence: float | None = None,
        plate_confidence_threshold: float | None = None,
        force_detection: bool = False,
        live_mode: bool = False,
    ) -> list[dict[str, Any]]:
        min_conf = min_plate_confidence if min_plate_confidence is not None else settings.min_plate_confidence
        plate_conf = (
            plate_confidence_threshold
            if plate_confidence_threshold is not None
            else settings.plate_confidence_threshold
        )
        min_plate_area = 100 if live_mode else settings.min_plate_area

        if not is_plate_model_ready():
            raise RuntimeError("Plate YOLO is not loaded")

        if plate_confidence_threshold is not None:
            self.plate_tracker.track_thresh = plate_conf

        run_yolo = self._should_run_yolo(force_detection)
        self._processed_count += 1

        if run_yolo:
            if live_mode:
                tracked_vehicles: list[dict[str, Any]] = []
                plate_detections = _live_detect_plates(frame, plate_conf, min_plate_area, frame_id)
                tracked_plates = plate_detections
            else:
                vehicles = detect_vehicles(frame, confidence_threshold)
                plate_detections = detect_plates(frame, plate_conf, min_plate_area=min_plate_area)
                tracked_vehicles = self.vehicle_tracker.update(vehicles, frame_id)
                tracked_plates = self.plate_tracker.update(plate_detections, frame_id)
        else:
            self.vehicle_tracker.predict(frame_id)
            self.plate_tracker.predict(frame_id)
            return []

        if not tracked_plates:
            return []

        plates_to_process = tracked_plates
        if live_mode and len(tracked_plates) > 2:
            plates_to_process = sorted(
                tracked_plates,
                key=lambda det: float(det.get("confidence", 0)),
                reverse=True,
            )[:2]

        results: list[dict[str, Any]] = []
        for plate_det in plates_to_process:
            bbox = plate_det["bbox"]
            vehicle = _associate_vehicle(bbox, tracked_vehicles)
            track_id = str(
                vehicle.get("track_id") if vehicle else plate_det.get("track_id") or f"plate_{frame_id}_{bbox[0]}"
            )

            record = extract_plate_record(
                frame,
                plate_det,
                frame_id,
                timestamp,
                vehicle,
                track_id,
                min_conf,
            )
            if record:
                results.append(record)

        return results

    def process_single_frame(
        self,
        frame: np.ndarray,
        frame_number: int,
        timestamp: float,
        *,
        live_mode: bool = False,
    ) -> dict[str, Any]:
        kwargs: dict[str, float | bool] = {"force_detection": True, "live_mode": live_mode}
        if live_mode:
            kwargs["min_plate_confidence"] = 0.35
            kwargs["plate_confidence_threshold"] = 0.10

        detections = self.process_frame_detections(
            frame,
            frame_number,
            timestamp,
            **kwargs,
        )
        payload: dict[str, Any] = {
            "frame_id": frame_number,
            "timestamp": timestamp,
        }
        if detections:
            accepted = [d for d in detections if d.get("detection_quality") == "accepted"]
            readable = [
                d
                for d in detections
                if str(d.get("plate_number", "")).upper() not in {"UNREADABLE", "UNKNOWN", "REJECTED", ""}
            ]
            pool = accepted or readable or detections
            best = max(pool, key=lambda d: d.get("_score", 0))
            slim = {k: v for k, v in best.items() if k != "_score"}
            if live_mode:
                slim.pop("plate_image_base64", None)
                slim.pop("plate_detection", None)
            payload.update(slim)
        return payload


def initialize_models():
    from services.detection_service import load_yolo
    from services.plate_detection_service import load_plate_yolo
    from services.ocr_service import load_ocr
    from services.model_registry import verify_production_models

    load_yolo()
    load_plate_yolo()
    load_ocr()
    verify_production_models()
    logger.info(
        "ANPR models initialized (pipeline=%s, plate_model_ready=%s, detection_interval=%s)",
        settings.anpr_pipeline,
        is_plate_model_ready(),
        settings.detection_interval,
    )
