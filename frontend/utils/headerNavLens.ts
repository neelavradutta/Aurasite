const STORAGE_KEY = 'apnr_header_nav_lens';
const FIRST_SWITCH_KEY = 'apnr_header_nav_first_switch';

export interface HeaderNavLensState {
  href: string;
  x: number;
  width: number;
}

export function readHeaderNavLens(): HeaderNavLensState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HeaderNavLensState;
  } catch {
    return null;
  }
}

export function writeHeaderNavLens(state: HeaderNavLensState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function hasHeaderNavFirstSwitch(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(FIRST_SWITCH_KEY) === '1';
}

export function markHeaderNavFirstSwitch(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(FIRST_SWITCH_KEY, '1');
}
