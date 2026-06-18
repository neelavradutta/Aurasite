import { useEffect, useState } from 'react';
import { fetchCameraLocations } from '@/services/api';
import { CameraLocation } from '@/utils/speedEstimation';

export function useCameraLocations() {
  const [locations, setLocations] = useState<CameraLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchCameraLocations()
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { locations, loading };
}
