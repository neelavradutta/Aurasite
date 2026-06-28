import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import '@/styles/globals.css';
import '@/styles/brown-cream/index.css';
import '@/styles/mobile.css';
import { useAppPageTransition } from '@/hooks/useAppPageTransition';
import { bumpChartAnimationEpoch } from '@/hooks/useChartAnimationKey';
import { usePeakTrafficBootstrap } from '@/hooks/usePeakTrafficBootstrap';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useLiveSessionKeepAlive } from '@/hooks/useLiveDetection';
import { syncDocumentThemeForRoute, useThemeStore } from '@/store/themeStore';

function ThemeBootstrap() {
  const router = useRouter();
  const hydrate = useThemeStore((state) => state.hydrate);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    syncDocumentThemeForRoute(router.pathname);
  }, [router.pathname, theme]);

  useEffect(() => {
    const onRouteChange = (url: string) => {
      syncDocumentThemeForRoute(url.split('?')[0] || '/');
    };
    router.events.on('routeChangeComplete', onRouteChange);
    return () => router.events.off('routeChangeComplete', onRouteChange);
  }, [router.events, theme]);

  return null;
}

function AppShell({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const pageEntering = useAppPageTransition();

  usePeakTrafficBootstrap();
  useSessionPersistence();
  useLiveSessionKeepAlive();

  useEffect(() => {
    const onRouteComplete = () => bumpChartAnimationEpoch();
    router.events.on('routeChangeComplete', onRouteComplete);
    return () => router.events.off('routeChangeComplete', onRouteComplete);
  }, [router.events]);

  return (
    <div className={pageEntering ? 'app-page-enter' : undefined}>
      <Component {...pageProps} />
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    <div className="min-h-screen">
      <Script id="apnr-theme-init" strategy="beforeInteractive">
        {`(function(){try{var p=window.location.pathname;if(p==='/login'||p==='/'){document.documentElement.removeAttribute('data-theme');return;}var t=localStorage.getItem('apnr_theme');if(t==='brown-cream'){document.documentElement.setAttribute('data-theme','brown-cream');}else{document.documentElement.removeAttribute('data-theme');}}catch(e){document.documentElement.removeAttribute('data-theme');}})();`}
      </Script>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/aurasite-icon.png" />
      </Head>
      <ThemeBootstrap />
      <AppShell {...props} />
    </div>
  );
}
