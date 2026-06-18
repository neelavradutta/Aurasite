const DETECTIONS_PAGE_ENTER_KEY = 'detections-page-enter';

export function markDetectionsPageEnter() {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(DETECTIONS_PAGE_ENTER_KEY, '1');
  }
}

export function consumeDetectionsPageEnter(): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(DETECTIONS_PAGE_ENTER_KEY) !== '1') return false;
  sessionStorage.removeItem(DETECTIONS_PAGE_ENTER_KEY);
  return true;
}
