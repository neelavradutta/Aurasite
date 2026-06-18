import logging
from typing import Any

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
    ) -> list[dict[str, Any]]:
        min_conf = min_plate_confidence if min_plate_confidence is not None else settings.min_plate_confidence
        plate_conf = (
            plate_confidence_threshold
            if plate_confidence_threshold is not None
            else settings.plate_confidence_threshold
        )

        if not is_plate_model_ready():
            raise RuntimeError("Plate YOLO is not loaded")

        if plate_confidence_threshold is not None:
            self.plate_tracker.track_thresh = plate_conf

        run_yolo = self._should_run_yolo(force_detection)
        self._processed_count += 1

        if run_yolo:
            vehicles = detect_vehicles(frame, confidence_threshold)
            plate_detections = detect_plates(frame, plate_conf)
            tracked_vehicles = self.vehicle_tracker.update(vehicles, frame_id)
            tracked_plates = self.plate_tracker.update(plate_detections, frame_id)
        else:
            self.vehicle_tracker.predict(frame_id)
            self.plate_tracker.predict(frame_id)
            return []

        if not tracked_plates:
            return []

        results: list[dict[str, Any]] = []
        for plate_det in tracked_plates:
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
    ) -> dict[str, Any]:
        detections = self.process_frame_detections(
            frame,
            frame_number,
            timestamp,
            force_detection=True,
        )
        payload: dict[str, Any] = {
            "frame_id": frame_number,
            "timestamp": timestamp,
        }
        if detections:
            accepted = [d for d in detections if d.get("detection_quality") == "accepted"]
            best = max(accepted or detections, key=lambda d: d.get("_score", 0))
            payload.update({k: v for k, v in best.items() if k != "_score"})
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
