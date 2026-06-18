import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'apnr-parking-max-capacity';
const DEFAULT_CAPACITY = 400;

function readStoredCapacity(): number {
  if (typeof window === 'undefined') return DEFAULT_CAPACITY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CAPACITY;
  return Math.min(9999, Math.round(parsed));
}

export function useParkingCapacity() {
  const [maxCapacity, setMaxCapacityState] = useState(DEFAULT_CAPACITY);

  useEffect(() => {
    setMaxCapacityState(readStoredCapacity());
  }, []);

  const setMaxCapacity = useCallback((value: number) => {
    const next = Math.min(9999, Math.max(1, Math.round(value)));
    setMaxCapacityState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    }
  }, []);

  return { maxCapacity, setMaxCapacity };
}
