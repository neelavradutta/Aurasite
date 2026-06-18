import { useRouter } from 'next/router';
import { useState, useSyncExternalStore } from 'react';

let chartAnimationEpoch = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return chartAnimationEpoch;
}

/** Called from _app on every completed route change (always mounted). */
export function bumpChartAnimationEpoch() {
  chartAnimationEpoch += 1;
  listeners.forEach((listener) => listener());
}

/** Remount key so pie charts replay their sweep on each tab visit. */
export function useChartAnimationKey(chartId: string): string {
  const { asPath } = useRouter();
  const epoch = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [mountId] = useState(() => Date.now());
  return `${chartId}-${asPath}-${epoch}-${mountId}`;
}
