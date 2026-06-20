import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { APP_PAGE_TRANSITION_MS, shouldAnimateAppRoute } from '@/utils/pageTransitions';

function routePathFromUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}

export function useAppPageTransition() {
  const router = useRouter();
  const [pageEntering, setPageEntering] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasInitialAnimatedRef = useRef(false);

  const beginPageEnter = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPageEntering(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPageEntering(true);
        timerRef.current = window.setTimeout(() => {
          setPageEntering(false);
          timerRef.current = null;
        }, APP_PAGE_TRANSITION_MS);
      });
    });
  }, []);

  useEffect(() => {
    const handleRouteComplete = (url: string) => {
      const path = routePathFromUrl(url);
      if (!shouldAnimateAppRoute(path)) return;
      beginPageEnter();
    };

    router.events.on('routeChangeComplete', handleRouteComplete);
    return () => router.events.off('routeChangeComplete', handleRouteComplete);
  }, [router.events, beginPageEnter]);

  useEffect(() => {
    if (!router.isReady || hasInitialAnimatedRef.current) return;
    if (!shouldAnimateAppRoute(router.pathname)) return;
    hasInitialAnimatedRef.current = true;
    beginPageEnter();
  }, [router.isReady, router.pathname, beginPageEnter]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  return pageEntering;
}
