export type VehicleStatus = 'active' | 'suspicious' | 'invalid' | 'accidental';

export interface VehicleRecentLocation {
  camera_code: string;
  camera_name: string;
  video_source: string;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  gps_updated_at: string | null;
}

export interface VehicleDetectionSummary {
  id: number;
  plate_number?: string | null;
  detection_timestamp?: string;
  frame_image_path?: string | null;
  video_source?: string | null;
}

export interface Vehicle {
  id: number;
  plate_number: string;
  detection_count: number;
  vehicle_type?: string | null;
  model?: string | null;
  manufacturing_year?: string | number | null;
  modifications?: string | null;
  engine_number?: string | null;
  chassis_number?: string | null;
  fuel_type?: string | null;
  insurance_status?: string | null;
  registration_date?: string | null;
  color?: string | null;
  owner_name?: string | null;
  work?: string | null;
  owner_contact?: string | null;
  owner_email?: string | null;
  owner_address?: string | null;
  driving_license?: string | null;
  registration_number?: string | null;
  is_suspicious?: boolean;
  status?: VehicleStatus | string | null;
  flagged_reason?: string | null;
  violation_count?: number;
  first_detected_timestamp?: string | null;
  last_detected_timestamp?: string | null;
  recent_location?: VehicleRecentLocation | null;
  detections?: VehicleDetectionSummary[];
}
