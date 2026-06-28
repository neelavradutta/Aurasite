import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

const DEFAULT_CAPACITY = 400;

function readStoredCapacity(userId: number | null): number {
  if (typeof window === 'undefined' || userId == null) return DEFAULT_CAPACITY;
  const raw = window.localStorage.getItem(`apnr-parking-max-capacity-u${userId}`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CAPACITY;
  return Math.min(9999, Math.round(parsed));
}

export function useParkingCapacity() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [maxCapacity, setMaxCapacityState] = useState(DEFAULT_CAPACITY);

  useEffect(() => {
    setMaxCapacityState(readStoredCapacity(userId));
  }, [userId]);

  const setMaxCapacity = useCallback(
    (value: number) => {
      const next = Math.min(9999, Math.max(1, Math.round(value)));
      setMaxCapacityState(next);
      if (typeof window !== 'undefined' && userId != null) {
        window.localStorage.setItem(`apnr-parking-max-capacity-u${userId}`, String(next));
      }
    },
    [userId]
  );

  return { maxCapacity, setMaxCapacity };
}
