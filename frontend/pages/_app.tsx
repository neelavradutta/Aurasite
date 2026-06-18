import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import '@/styles/globals.css';
import { bumpChartAnimationEpoch } from '@/hooks/useChartAnimationKey';
import { usePeakTrafficBootstrap } from '@/hooks/usePeakTrafficBootstrap';

function AppShell({ Component, pageProps }: AppProps) {
  const router = useRouter();

  usePeakTrafficBootstrap();

  useEffect(() => {
    const onRouteComplete = () => bumpChartAnimationEpoch();
    router.events.on('routeChangeComplete', onRouteComplete);
    return () => router.events.off('routeChangeComplete', onRouteComplete);
  }, [router.events]);
  return <Component {...pageProps} />;
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
