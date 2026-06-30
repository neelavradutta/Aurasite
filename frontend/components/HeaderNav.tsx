import Link from 'next/link';
import { useRouter } from 'next/router';
import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { navItemIcons } from '@/components/NavIcons';
import {
  hasHeaderNavFirstSwitch,
  markHeaderNavFirstSwitch,
  readHeaderNavLens,
  writeHeaderNavLens,
} from '@/utils/headerNavLens';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/detections', label: 'Detections' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/live', label: 'Live' },
] as const;

type NavHref = (typeof navItems)[number]['href'];

const GLASS_LENS_SPRING = {
  type: 'spring' as const,
  damping: 20,
  stiffness: 280,
  mass: 0.9,
};

interface LensRect {
  x: number;
  width: number;
  top: number;
  height: number;
}

function measureTabs(
  container: HTMLElement,
  itemRefs: Partial<Record<NavHref, HTMLDivElement | null>>
): Partial<Record<NavHref, LensRect>> {
  const containerRect = container.getBoundingClientRect();
  const measured: Partial<Record<NavHref, LensRect>> = {};

  navItems.forEach((item) => {
    const el = itemRefs[item.href];
    if (!el) return;

    const elRect = el.getBoundingClientRect();
    measured[item.href] = {
      x: elRect.left - containerRect.left,
      width: elRect.width,
      top: elRect.top - containerRect.top,
      height: elRect.height,
    };
  });

  return measured;
}

export default function HeaderNav() {
  const router = useRouter();
  const containerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Partial<Record<NavHref, HTMLDivElement | null>>>({});
  const [lens, setLens] = useState<LensRect>({ x: 0, width: 0, top: 0, height: 0 });
  const [lensVisible, setLensVisible] = useState(false);
  const [instant, setInstant] = useState(true);

  const activeHref =
    navItems.find((item) => router.pathname === item.href)?.href ?? navItems[0].href;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measured = measureTabs(container, itemRefs.current);
    const target = measured[activeHref];
    if (!target) return;

    const stored = readHeaderNavLens();
    const firstSwitchDone = hasHeaderNavFirstSwitch();

    if (!stored) {
      setInstant(true);
      setLens(target);
      setLensVisible(true);
      writeHeaderNavLens({ href: activeHref, x: target.x, width: target.width });
      return;
    }

    if (stored.href === activeHref) {
      setInstant(true);
      setLens(target);
      setLensVisible(true);
      writeHeaderNavLens({ href: activeHref, x: target.x, width: target.width });
      return;
    }

    const previous = measured[stored.href as NavHref];

    if (!firstSwitchDone) {
      setInstant(true);
      setLens({ x: 0, width: 0, top: target.top, height: target.height });
      setLensVisible(true);
      markHeaderNavFirstSwitch();
      requestAnimationFrame(() => {
        setInstant(false);
        setLens(target);
      });
      return;
    }

    if (previous) {
      setInstant(true);
      setLens({ ...previous, top: target.top, height: target.height });
      setLensVisible(true);
      requestAnimationFrame(() => {
        setInstant(false);
        setLens(target);
      });
      return;
    }

    setInstant(true);
    setLens(target);
    setLensVisible(true);
    writeHeaderNavLens({ href: activeHref, x: target.x, width: target.width });
  }, [activeHref]);

  useLayoutEffect(() => {
    const onResize = () => {
      const container = containerRef.current;
      if (!container) return;

      const measured = measureTabs(container, itemRefs.current);
      const target = measured[activeHref];
      if (!target) return;

      setInstant(true);
      setLens(target);
      writeHeaderNavLens({ href: activeHref, x: target.x, width: target.width });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeHref]);

  return (
    <nav ref={containerRef} className="relative hidden items-center gap-1 lg:flex">
      <motion.div
        className="header-nav-lens pointer-events-none absolute rounded-md bg-cyber-cyan/15 shadow-neon"
        animate={{
          x: lens.x,
          width: lens.width,
        }}
        transition={instant ? { duration: 0 } : GLASS_LENS_SPRING}
        onAnimationComplete={() => {
          if (!instant && lens.width > 0) {
            writeHeaderNavLens({ href: activeHref, x: lens.x, width: lens.width });
          }
        }}
        style={{
          left: 0,
          top: lens.top,
          height: lens.height || undefined,
          opacity: lensVisible ? 1 : 0,
        }}
        aria-hidden
      />

      {navItems.map((item) => {
        const Icon = navItemIcons[item.href];
        const isActive = router.pathname === item.href;

        return (
          <div
            key={item.href}
            ref={(el) => {
              itemRefs.current[item.href] = el;
            }}
            className="relative z-10"
          >
            <Link
              href={item.href}
              className={`header-nav-link inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${
                isActive
                  ? 'header-nav-link--active text-cyber-cyan'
                  : 'text-slate-300 hover:bg-white/5 hover:text-cyber-cyan'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-white" />
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
