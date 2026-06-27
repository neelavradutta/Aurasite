import Link from 'next/link';
import { useState } from 'react';
import Card from '@/components/shared/Card';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import { SpeedometerPanelIcon } from '@/components/NavIcons';
import VehicleSpeedPeaksChart from '@/components/Analytics/VehicleSpeedPeaksChart';
import { VehicleSpeedReading } from '@/utils/speedEstimation';
export const VEHICLE_SPEED_ANCHOR = 'vehicle-speed';

interface Props {
  readings: VehicleSpeedReading[];
  className?: string;
  /** Dashboard preview: top N plates by speed. */
  limit?: number;
  href?: string;
  sectionId?: string;
  fillHeight?: boolean;
}

function SpeedCard({
  reading,
  compact = false,
  fillRow = false,
  barHeightClass = '',
  interactive = false,
}: {
  reading: VehicleSpeedReading;
  compact?: boolean;
  fillRow?: boolean;
  barHeightClass?: string;
  interactive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`fiery-speed-card flex min-w-0 items-center justify-between gap-2 rounded-xl ${
        interactive ? 'fiery-speed-card-interactive' : ''
      } ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} ${
        fillRow
          ? 'h-full min-h-0'
          : barHeightClass || (compact ? 'h-[2.125rem] shrink-0' : '')
      }`}
      data-hovered={interactive && hovered ? 'true' : undefined}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
    >
      <p
        className={`fiery-speed-text min-w-0 flex-1 truncate font-orbitron font-bold leading-none ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        {reading.plate_number}
      </p>
      <p className={`fiery-speed-value shrink-0 font-orbitron font-bold leading-none ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="fiery-speed-embers" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="fiery-speed-ember" />
          ))}
        </span>
        <span className="fiery-speed-number">{reading.speed_kmh}</span>
        <span className="fiery-speed-unit ml-1.5 text-[10px] font-bold uppercase">km/h</span>
      </p>
    </div>
  );
}

function DashboardSpeedList({ readings }: { readings: VehicleSpeedReading[] }) {
  const visible = readings.slice(0, 3);
  const count = visible.length;

  if (count === 3) {
    return (
      <div className="mt-1 grid min-h-0 flex-1 grid-rows-3 gap-1.5 overflow-visible">
        {visible.map((reading) => (
          <SpeedCard
            key={`${reading.plate_number}-${reading.detection_id}`}
            reading={reading}
            compact
            fillRow
            interactive
          />
        ))}
      </div>
    );
  }

  const barHeightClass =
    count === 1 ? 'h-[3rem] shrink-0' : count === 2 ? 'h-[2.75rem] shrink-0' : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-visible">
      {visible.map((reading) => (
        <SpeedCard
          key={`${reading.plate_number}-${reading.detection_id}`}
          reading={reading}
          compact
          barHeightClass={barHeightClass}
          interactive
        />
      ))}
    </div>
  );
}

export default function VehicleSpeedPanel({
  readings,
  className = '',
  limit,
  href,
  sectionId,
  fillHeight = false,
}: Props) {
  const isDashboard = Boolean(limit && href);
  const visible = limit ? readings.slice(0, Math.min(limit, 3)) : readings;

  const panel = (
    <Card
      id={sectionId}
      className={`${
        fillHeight || isDashboard
          ? 'flex h-full min-h-0 max-h-full flex-col overflow-hidden !pb-2'
          : 'flex h-full min-h-[22rem] flex-col overflow-hidden'
      } ${isDashboard ? 'px-3.5 pt-3' : '!p-3'} h-full min-h-0 ${
        href ? 'transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]' : ''
      } ${sectionId ? 'scroll-mt-24' : ''} ${href ? '' : className}`.trim()}
    >
      <PanelIconHeader
        icon={<SpeedometerPanelIcon />}
        title="Vehicle Speed"
        iconBg="bg-white/10"
        iconColor="text-white"
      />
      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-slate-500">No speed estimates yet.</p>
        </div>
      ) : isDashboard ? (
        <DashboardSpeedList readings={visible} />
      ) : (
        <div className="min-h-[19.5rem] flex-1 overflow-hidden">
          <VehicleSpeedPeaksChart readings={visible} />
        </div>
      )}

      {href ? (
        <p
          className={`mb-2 shrink-0 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover:text-cyber-cyan/80 ${
            isDashboard ? 'mt-auto translate-y-1 pt-1' : 'mt-2'
          }`}
        >
          View full analytics
        </p>
      ) : null}
    </Card>
  );

  if (!href) return panel;

  return (
    <Link
      href={href}
      className={`group block h-full min-h-0 min-w-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50 ${className}`.trim()}
      aria-label="Open Vehicle Speed in Analytics"
    >
      {panel}
    </Link>
  );
}
