import logging
from typing import Any

import numpy as np
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger(__name__)


def iou(box_a: list[int], box_b: list[int]) -> float:
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class ByteTracker:
    """Lightweight ByteTrack-style tracker with bbox prediction on skipped frames."""

    def __init__(
        self,
        max_age: int = 30,
        iou_threshold: float = 0.8,
        track_thresh: float = 0.5,
    ):
        self.max_age = max_age
        self.iou_threshold = iou_threshold
        self.track_thresh = track_thresh
        self.tracks: dict[str, dict[str, Any]] = {}
        self.next_id = 1

    def reset(self) -> None:
        self.tracks.clear()
        self.next_id = 1

    def _bbox_center(self, bbox: list[int]) -> list[int]:
        return [(bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2]

    def _shift_bbox(self, bbox: list[int], dx: float, dy: float) -> list[int]:
        x1, y1, x2, y2 = bbox
        return [int(x1 + dx), int(y1 + dy), int(x2 + dx), int(y2 + dy)]

    def predict(self, frame_id: int) -> None:
        for track in self.tracks.values():
            traj = track.get("trajectory", [])
            dx = dy = 0.0
            if len(traj) >= 2:
                dx = traj[-1][0] - traj[-2][0]
                dy = traj[-1][1] - traj[-2][1]

            track["bbox"] = self._shift_bbox(track["bbox"], dx, dy)
            center = self._bbox_center(track["bbox"])
            traj.append(center)
            track["trajectory"] = traj[-30:]
            track["last_frame"] = frame_id
            track["age"] += 1
            track["predicted"] = True

        self._prune()

    def active_detections(self) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for tid, track in self.tracks.items():
            if track["age"] > self.max_age // 2:
                continue
            output.append(
                {
                    "bbox": track["bbox"],
                    "track_id": tid,
                    "class_name": track.get("vehicle_class") or track.get("class_name", "unknown"),
                    "confidence": float(track.get("confidence", self.track_thresh)),
                }
            )
        return output

    def update(self, detections: list[dict[str, Any]], frame_id: int) -> list[dict[str, Any]]:
        filtered = [d for d in detections if float(d.get("confidence", 0)) >= self.track_thresh]
        if not filtered:
            self.predict(frame_id)
            return []

        track_ids = list(self.tracks.keys())
        track_boxes = [self.tracks[tid]["bbox"] for tid in track_ids]
        det_boxes = [d["bbox"] for d in filtered]

        matched_det: set[int] = set()
        matched_track: set[str] = set()

        if track_boxes and det_boxes:
            cost = np.zeros((len(track_boxes), len(det_boxes)))
            for i, tb in enumerate(track_boxes):
                for j, db in enumerate(det_boxes):
                    cost[i, j] = 1 - iou(tb, db)

            row_ind, col_ind = linear_sum_assignment(cost)
            for r, c in zip(row_ind, col_ind):
                if 1 - cost[r, c] >= self.iou_threshold:
                    tid = track_ids[r]
                    det = filtered[c]
                    center = self._bbox_center(det["bbox"])
                    self.tracks[tid]["bbox"] = det["bbox"]
                    self.tracks[tid]["last_frame"] = frame_id
                    self.tracks[tid]["age"] = 0
                    self.tracks[tid]["predicted"] = False
                    self.tracks[tid]["detections_count"] += 1
                    self.tracks[tid]["confidence"] = float(det.get("confidence", self.track_thresh))
                    self.tracks[tid]["vehicle_class"] = det.get("class_name")
                    self.tracks[tid]["trajectory"].append(center)
                    self.tracks[tid]["trajectory"] = self.tracks[tid]["trajectory"][-30:]
                    det["track_id"] = tid
                    matched_det.add(c)
                    matched_track.add(tid)

        for j, det in enumerate(filtered):
            if j in matched_det:
                continue
            tid = f"track_{self.next_id:03d}"
            self.next_id += 1
            center = self._bbox_center(det["bbox"])
            self.tracks[tid] = {
                "track_id": tid,
                "bbox": det["bbox"],
                "first_frame": frame_id,
                "last_frame": frame_id,
                "age": 0,
                "predicted": False,
                "detections_count": 1,
                "trajectory": [center],
                "vehicle_class": det.get("class_name"),
                "confidence": float(det.get("confidence", self.track_thresh)),
            }
            det["track_id"] = tid

        for tid in track_ids:
            if tid not in matched_track:
                self.tracks[tid]["age"] += 1

        self._prune()
        return filtered

    def _prune(self) -> None:
        stale = [tid for tid, track in self.tracks.items() if track["age"] > self.max_age]
        for tid in stale:
            del self.tracks[tid]
