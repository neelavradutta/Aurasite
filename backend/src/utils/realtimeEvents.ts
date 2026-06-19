import { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export type VehicleRealtimePayload = {
  vehicle_id: number;
  plate_number: string;
  status: string | null;
  is_suspicious: boolean;
  flagged_reason: string | null;
  violation_count: number;
};

export function setRealtimeSocket(server: SocketServer | null): void {
  io = server;
}

export function emitVehicleUpdated(payload: VehicleRealtimePayload): void {
  io?.emit('vehicle:updated', payload);
}

export function emitViolationsUpdated(
  updates: Array<{ vehicle_id: number; plate_number: string; violation_count: number }>
): void {
  if (updates.length === 0) return;
  io?.emit('violations:updated', { updates });
}

export function emitDetectionsChanged(payload: { videoSource: string; savedCount: number }): void {
  io?.emit('detections:changed', payload);
}
