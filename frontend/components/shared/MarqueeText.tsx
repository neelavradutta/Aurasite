import { useLayoutEffect, useRef, useState } from 'react';

const SCROLL_IN_MS = 12000;
const PAUSE_MS = 100;

interface Props {
  text: string;
  className?: string;
}

function isTextVisible(textEl: HTMLElement, containerEl: HTMLElement): boolean {
  const textRect = textEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  return textRect.right > containerRect.left && textRect.left < containerRect.right;
}

export default function MarqueeText({ text, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measureEl = measureRef.current;
    if (!container || !measureEl) return;

    const measure = () => {
      setOverflow(measureEl.scrollWidth > container.clientWidth + 4);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!overflow || !container || !textEl) {
      textEl?.getAnimations().forEach((anim) => anim.cancel());
      if (textEl) textEl.style.transform = '';
      return;
    }

    let cancelled = false;
    const textWidth = textEl.scrollWidth;
    const scrollEndPx = container.clientWidth / 2 - textWidth;
    const exitMs = SCROLL_IN_MS;

    const waitForHidden = (anim: Animation) =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelled) {
            resolve();
            return;
          }
          if (!isTextVisible(textEl, container)) {
            anim.cancel();
            resolve();
            return;
          }
          if (anim.playState === 'finished') {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

    const runLoop = async () => {
      while (!cancelled) {
        textEl.style.transform = 'translateX(100%)';

        const scrollIn = textEl.animate(
          [{ transform: 'translateX(100%)' }, { transform: `translateX(${scrollEndPx}px)` }],
          { duration: SCROLL_IN_MS, easing: 'linear', fill: 'forwards' }
        );
        await scrollIn.finished.catch(() => undefined);
        if (cancelled) break;

        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
        if (cancelled) break;

        const scrollOut = textEl.animate(
          [{ transform: `translateX(${scrollEndPx}px)` }, { transform: `translateX(${textWidth}px)` }],
          { duration: exitMs, easing: 'linear', fill: 'forwards' }
        );
        await waitForHidden(scrollOut);
      }
    };

    runLoop();

    return () => {
      cancelled = true;
      textEl.getAnimations().forEach((anim) => anim.cancel());
      textEl.style.transform = '';
    };
  }, [overflow, text]);

  return (
    <div ref={containerRef} className={`relative min-w-0 flex-1 overflow-hidden ${className}`}>
      <span ref={measureRef} className="pointer-events-none absolute -z-10 whitespace-nowrap opacity-0" aria-hidden>
        {text}
      </span>
      {overflow ? (
        <span ref={textRef} className="inline-block whitespace-nowrap font-semibold will-change-transform">
          {text}
        </span>
      ) : (
        <span className="block truncate font-semibold">{text}</span>
      )}
    </div>
  );
}
