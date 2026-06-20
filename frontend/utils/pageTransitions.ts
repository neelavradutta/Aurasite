export const APP_PAGE_TRANSITION_MS = 600;

export function shouldAnimateAppRoute(pathname: string): boolean {
  return pathname !== '/login' && pathname !== '/';
}
