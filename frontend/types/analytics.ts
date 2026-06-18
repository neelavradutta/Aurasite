export interface Alert {
  id: number;
  alert_type: string;
  alert_message?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  resolved_at?: string | null;
}

export interface AnalyticsSummary {
  total_detections: number;
  unique_plates: number;
  avg_confidence: string | number;
  unresolved_alerts: number;
}

export interface TrafficHour {
  hour: number;
  count: number;
  percentage: number;
}

export interface ConfidenceBand {
  band: string;
  count: number;
  percentage: number;
}

export interface RepeatAnalysis {
  unique_vehicles: number;
  repeat_vehicles: number;
  most_active_plate: string | null;
  most_active_count: number;
}

export interface ParkingHourlyPoint {
  hour: number;
  label: string;
  occupancyPct: number;
  occupied: number;
}

export interface ParkingOccupancyResult {
  hourly: ParkingHourlyPoint[];
  axisLabels: string[];
  currentOccupied: number;
  currentPct: number;
  peakHour: number;
  peakLabel: string;
  peakPct: number;
  peakOccupied: number;
  available: number;
  maxCapacity: number;
  isPeakAlert: boolean;
}
