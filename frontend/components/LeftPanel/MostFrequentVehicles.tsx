import Link from 'next/link';
import { Vehicle } from '@/types/vehicle';
import { getVehicleTypeIcon, resolveVehicleType } from '@/utils/vehicleCardDisplay';
import Card from '../shared/Card';
import Badge from '../shared/Badge';

export const MOST_FREQUENT_VEHICLES_ANCHOR = 'most-frequent-vehicles';

interface Props {
  vehicles: Vehicle[];
  variant?: 'default' | 'bars';
  className?: string;
  size?: 'default' | 'lg';
  /** Max rows to show (dashboard uses 3). */
  limit?: number;
  /** Dashboard preview: plate number only inside each row box. */
  platesOnly?: boolean;
  /** When set, the whole panel links to analytics (or another route). */
  href?: string;
  /** Dashboard grid row: stretch to match paired panel height. */
  fillHeight?: boolean;
  /** Anchor id for scroll targets on the analytics page. */
  sectionId?: string;
}

export default function MostFrequentVehicles({
  vehicles,
  variant = 'default',
  className = '',
  size = 'default',
  limit = 5,
  platesOnly = false,
  href,
  fillHeight = false,
  sectionId,
}: Props) {
  const sorted = [...vehicles]
    .sort((a, b) => b.detection_count - a.detection_count)
    .slice(0, limit);

  if (variant === 'bars') {
    const maxHits = sorted[0]?.detection_count ?? 1;

    return (
      <section
        id={sectionId}
        className={`glass-panel flex h-full min-h-0 flex-col rounded-xl border border-white/5 p-4 ${
          sectionId ? 'scroll-mt-24' : ''
        } ${className}`}
      >
        <header className="mb-3 shrink-0">
          <h3 className="section-title">Most Frequent Vehicles</h3>
          <p className="mt-0.5 w-full truncate text-[10px] text-nowrap text-slate-500">
            Plates seen most often in recent detections.
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {sorted.length === 0 ? (
            <div className="flex min-h-[10rem] flex-1 items-center justify-center px-4 py-8">
              <p className="text-center text-sm text-slate-500">No vehicle data yet</p>
            </div>
          ) : (
            sorted.map((vehicle, index) => (
              <FrequentVehicleBar
                key={`${vehicle.plate_number}-${vehicle.detection_count}-${index}`}
                vehicle={vehicle}
                rank={index + 1}
                maxHits={maxHits}
                delay={index * 120}
              />
            ))
          )}
        </div>
      </section>
    );
  }

  const isLarge = size === 'lg';
  const rowBoxClass = isLarge ? 'px-3.5 py-2.5' : 'px-3 py-2';
  const rowMinHeightClass = isLarge ? 'min-h-[4.25rem]' : 'min-h-[4rem]';

  const panel = (
    <Card
      className={`${
        href && fillHeight
          ? 'flex h-full min-h-0 max-h-full flex-col overflow-hidden !pb-5'
          : href
            ? 'h-auto shrink-0 overflow-hidden !pb-2.5'
            : 'h-full'
      } ${isLarge ? (href ? 'px-5 pt-5' : 'p-5') : ''} ${
        href ? 'transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]' : ''
      } ${className}`.trim()}
    >
      <header className="mb-3 shrink-0">
        <h3 className="section-title">Most Frequent Vehicles</h3>
        <p className="mt-0.5 w-full truncate text-[10px] text-nowrap text-slate-500">
          Plates seen most often in recent detections.
        </p>
      </header>
      <div
        className={`${
          fillHeight ? 'flex min-h-0 flex-1 flex-col' : ''
        } ${sorted.length > 0 ? (isLarge ? 'justify-center space-y-3.5' : 'justify-center space-y-3') : ''}`}
      >
        {sorted.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8">
            <p className="text-center text-sm text-slate-500">No vehicle data yet</p>
          </div>
        ) : null}
        {sorted.map((vehicle, index) =>
          platesOnly ? (
            <div
              key={vehicle.id}
              className={`flex items-center justify-center rounded-lg border border-white/45 bg-black/20 ${rowBoxClass} ${rowMinHeightClass}`}
            >
              <p
                className={`w-full truncate text-center font-mono text-cyber-cyan ${
                  isLarge ? 'text-base' : 'text-sm'
                }`}
              >
                {vehicle.plate_number}
              </p>
            </div>
          ) : (
            <div
              key={vehicle.id}
              className={`flex items-center justify-between rounded-lg border border-white/5 bg-white/5 ${rowBoxClass} ${rowMinHeightClass}`}
            >
              <div>
                <p className={`font-mono text-cyber-cyan ${isLarge ? 'text-base' : 'text-sm'}`}>
                  {vehicle.plate_number}
                </p>
                <p className={`text-slate-400 ${isLarge ? 'text-sm' : 'text-xs'}`}>
                  {vehicle.vehicle_type || 'unknown'}
                </p>
              </div>
              <div className="text-right">
                <Badge tone={vehicle.is_suspicious ? 'pink' : 'green'}>#{index + 1}</Badge>
                <p className={`mt-1 text-slate-300 ${isLarge ? 'text-sm' : 'text-xs'}`}>
                  {vehicle.detection_count} hits
                </p>
              </div>
            </div>
          )
        )}
      </div>
      {href ? (
        <p
          className={`mb-0 shrink-0 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover:text-cyber-cyan/80 ${
            fillHeight ? 'mt-auto pt-3' : 'mt-2'
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
      className={`group flex min-h-0 flex-col rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50 ${
        fillHeight ? 'h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0' : 'h-auto shrink-0'
      }`}
      aria-label="Open Most Frequent Vehicles in Analytics"
    >
      {panel}
    </Link>
  );
}

function FrequentVehicleBar({
  vehicle,
  rank,
  maxHits,
  delay,
}: {
  vehicle: Vehicle;
  rank: number;
  maxHits: number;
  delay: number;
}) {
  const widthPct = Math.max((vehicle.detection_count / maxHits) * 100, 8);
  const toneClass = `frequent-vehicle-tone-${Math.min(rank, 5)}`;
  const vehicleIcon = getVehicleTypeIcon(resolveVehicleType(vehicle.vehicle_type));

  return (
    <div className={`flex flex-col gap-1.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="fv-plate-label truncate font-orbitron text-sm font-bold tracking-wide">
          {vehicle.plate_number}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="fv-plate-label flex items-center gap-1.5 font-orbitron text-[11px] font-bold sm:text-xs">
            <span className="text-sm leading-none" aria-hidden>
              {vehicleIcon}
            </span>
            {vehicle.detection_count} hits
          </span>
          <span className="fv-rank-badge rounded-full border px-2 py-0.5 font-orbitron text-[11px] font-bold sm:text-xs">
            #{rank}
          </span>
        </div>
      </div>

      <div className="frequent-vehicle-bar-shell h-5 overflow-hidden rounded-md border">
        <div
          className="frequent-vehicle-progress"
          style={{
            ['--bar-width' as string]: `${widthPct}%`,
            ['--bar-delay' as string]: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}
