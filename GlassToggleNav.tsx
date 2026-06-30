import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface NavItem {
  id: string;
  label: string;
}

interface GlassToggleNavProps {
  items?: NavItem[];
  onSelect?: (id: string) => void;
  activeId?: string;
}

const defaultItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'detection', label: 'Detection' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'live', label: 'Live' },
];

export const GlassToggleNav: React.FC<GlassToggleNavProps> = ({
  items = defaultItems,
  onSelect,
  activeId = 'dashboard',
}) => {
  const [selected, setSelected] = useState(activeId);
  const [positions, setPositions] = useState<{ [key: string]: number }>({});
  const [widths, setWidths] = useState<{ [key: string]: number }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const updatePositions = () => {
      if (containerRef.current) {
        const newPositions: { [key: string]: number } = {};
        const newWidths: { [key: string]: number } = {};
        items.forEach((item) => {
          const el = itemRefs.current[item.id];
          if (el && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            newPositions[item.id] = elRect.left - containerRect.left;
            newWidths[item.id] = elRect.width;
          }
        });
        setPositions(newPositions);
        setWidths(newWidths);
      }
    };

    const timer = setTimeout(updatePositions, 0);
    window.addEventListener('resize', updatePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePositions);
    };
  }, [items]);

  const selectedPos = positions[selected] ?? 0;
  const selectedWidth = widths[selected] ?? 0;

  const handleSelect = (id: string) => {
    setSelected(id);
    onSelect?.(id);
  };

  return (
    <div className="bg-neutral-950 p-8">
      <div className="relative w-full">
        {/* Glass Container */}
        <div
          ref={containerRef}
          className="relative h-14 bg-white/5 border border-white/15 rounded-full p-1.5 flex items-center overflow-hidden"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* Refracted Highlight Layer - shows highlighted text underneath */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height="100%"
            viewBox={`0 0 ${containerRef.current?.offsetWidth || 400} 56`}
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="refract" x="-50%" y="-50%" width="200%" height="200%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.02"
                  numOctaves="3"
                  result="noise"
                  seed="2"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale="2"
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
            </defs>
          </svg>

          {/* Glass Lens - magnifying/refracting glass */}
          <motion.div
            className="absolute h-12 rounded-full pointer-events-none"
            animate={{
              x: selectedPos,
              width: selectedWidth,
            }}
            transition={{
              type: 'spring',
              damping: 20,
              stiffness: 280,
              mass: 0.9,
            }}
            style={{
              left: 2,
              top: 2,
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: `
                inset 0 0 20px rgba(255, 255, 255, 0.1),
                0 0 20px rgba(255, 255, 255, 0.05),
                inset -1px -1px 1px rgba(0, 0, 0, 0.3)
              `,
            }}
          />

          {/* Navigation Buttons */}
          <div className="relative z-10 flex w-full items-center justify-between px-1">
            {items.map((item) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) itemRefs.current[item.id] = el;
                }}
                className="flex-1 h-12 flex items-center justify-center"
              >
                <button
                  onClick={() => handleSelect(item.id)}
                  className={`
                    h-full w-full px-4 rounded-full font-medium text-sm
                    transition-colors duration-300 relative
                    ${
                      selected === item.id
                        ? 'text-white/95'
                        : 'text-white/45 hover:text-white/65'
                    }
                  `}
                >
                  <span className="relative z-20">{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlassToggleNav;
