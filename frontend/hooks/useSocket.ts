import { useEffect, useState } from 'react';
import { getSocket } from '@/services/socket';
import { useDashboardStore } from '@/store/dashboardStore';
import { Detection } from '@/types/detection';
import { isLiveVideoSource } from '@/utils/liveVideoSource';

export function useSocket() {
  const { addDetection, sessionVideoSource } = useDashboardStore();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    if (socket.connected) {
      setConnected(true);
    }

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('detection', (payload: {
      plate: string;
      confidence: number;
      vehicle_type?: string;
      timestamp: string;
      detection_id?: number;
      video_source?: string;
      frame_image_path?: string | null;
      frame_number?: number;
      track_id?: string;
      plate_bbox?: Detection['plate_bbox'];
      bounding_box?: Detection['bounding_box'];
      detection_quality?: string;
    }) => {
      const videoSource = payload.video_source || sessionVideoSource;
      if (isLiveVideoSource(videoSource)) return;

      if (sessionVideoSource && videoSource && videoSource !== sessionVideoSource) {
        return;
      }

      addDetection({
        id: payload.detection_id || Date.now(),
        plate_number: payload.plate,
        plate_confidence: payload.confidence,
        vehicle_type: payload.vehicle_type,
        detection_timestamp: payload.timestamp,
        video_source: videoSource,
        frame_image_path: payload.frame_image_path ?? null,
        frame_number: payload.frame_number,
        track_id: payload.track_id,
        plate_bbox: payload.plate_bbox,
        bounding_box: payload.bounding_box,
        detection_quality: payload.detection_quality,
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('detection');
    };
  }, [addDetection, sessionVideoSource]);

  return { connected };
}
