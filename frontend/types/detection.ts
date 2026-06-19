export interface DetectionVehicle {
  id?: number;
  plate_number?: string;
  owner_name?: string | null;
  owner_contact?: string | null;
  owner_address?: string | null;
  color?: string | null;
  registration_date?: string | null;
  registration_number?: string | null;
  is_suspicious?: boolean;
  status?: string | null;
  violation_count?: number | null;
  first_detected_timestamp?: string | null;
  created_at?: string | null;
  vehicle_type?: string | null;
  class_name?: string | null;
  total_challan_paid?: number | null;
}

export interface Detection {
  id: number;
  vehicle_id?: number;
  detection_timestamp: string;
  plate_number: string;
  plate_confidence?: number;
  vehicle_confidence?: number;
  frame_number?: number;
  vehicle_type?: string;
  vehicle_color?: string | null;
  is_repeat_detection?: boolean;
  detection_quality?: string;
  track_id?: string;
  video_source?: string | null;
  frame_image_path?: string | null;
  plate_bbox?: { bbox?: number[] } | number[] | null;
  bounding_box?: { bbox?: number[] } | number[] | null;
  vehicle?: DetectionVehicle | null;
}

export interface DetectionSummary {
  total_detections: number;
  unique_plates: number;
  avg_confidence: string | number;
  unresolved_alerts: number;
}
