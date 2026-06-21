import { useCallback, useEffect, useRef, useState } from 'react';

import AurasiteIcon from '@/components/AurasiteIcon';

const LAUNCH_MS = 460;

interface Props {
  onOpen: () => void;
}

export default function AurasiteIconTrigger({ onOpen }: Props) {
  const [launching, setLaunching] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    if (launching) return;

    setLaunching(true);
    timerRef.current = window.setTimeout(() => {
      onOpen();
      setLaunching(false);
      timerRef.current = null;
    }, LAUNCH_MS);
  }, [launching, onOpen]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`aurasite-icon-trigger${launching ? ' aurasite-icon-trigger--launching' : ''}`}
      aria-label="About Aurasite"
    >
      <span className="aurasite-icon-trigger__halo" aria-hidden />
      <span className="aurasite-icon-trigger__ring aurasite-icon-trigger__ring--outer" aria-hidden />
      <span className="aurasite-icon-trigger__ring aurasite-icon-trigger__ring--inner" aria-hidden />
      <span className="aurasite-icon-trigger__scan" aria-hidden />
      <span className="aurasite-icon-trigger__corners" aria-hidden />
      <span className="aurasite-icon-trigger__ripple" aria-hidden />
      <span className="aurasite-icon-trigger__burst" aria-hidden />
      <AurasiteIcon size={44} className="aurasite-icon-trigger__icon h-11 w-11" />
    </button>
  );
}
