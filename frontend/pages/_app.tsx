import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import '@/styles/globals.css';
import { useAppPageTransition } from '@/hooks/useAppPageTransition';
import { bumpChartAnimationEpoch } from '@/hooks/useChartAnimationKey';
import { usePeakTrafficBootstrap } from '@/hooks/usePeakTrafficBootstrap';
import { useLiveSessionKeepAlive } from '@/hooks/useLiveDetection';

function AppShell({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const pageEntering = useAppPageTransition();

  usePeakTrafficBootstrap();
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
    <div className="scanlines min-h-screen">
      <Head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/aurasite-icon.png" />
      </Head>
      <AppShell {...props} />
    </div>
  );
}
