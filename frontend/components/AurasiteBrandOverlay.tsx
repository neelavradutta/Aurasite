import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import AurasiteIcon from '@/components/AurasiteIcon';

const TAGLINE =
  'Your one stop destination for Plate Detection and Surveillance';

const CLOSE_MS = 520;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AurasiteBrandOverlay({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (closing) return;

    setClosing(true);
    window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, CLOSE_MS);
  }, [closing, onClose]);

  useEffect(() => {
    if (!visible) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const preventTouchMove = (event: TouchEvent) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchmove', preventTouchMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, requestClose]);

  if (!mounted || !visible) return null;

  const words = TAGLINE.split(' ');

  return createPortal(
    <div
      className={`aurasite-brand-overlay${closing ? ' aurasite-brand-overlay--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Aurasite"
      onClick={requestClose}
    >
      <div className="aurasite-brand-overlay__portal" aria-hidden />

      <div
        className="aurasite-brand-overlay__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="aurasite-brand-overlay__icon-wrap">
          <span className="aurasite-brand-overlay__icon-ring" aria-hidden />
          <AurasiteIcon size={140} className="aurasite-brand-overlay__icon" />
        </div>

        <h2 className="aurasite-brand-overlay__title font-orbitron">Aurasite</h2>

        <p className="aurasite-brand-overlay__tagline" aria-label={TAGLINE}>
          {words.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className="aurasite-brand-overlay__tagline-word"
              style={{ animationDelay: `${0.55 + index * 0.07}s` }}
            >
              {word}
              {index < words.length - 1 ? '\u00a0' : ''}
            </span>
          ))}
        </p>
      </div>
    </div>,
    document.body
  );
}
