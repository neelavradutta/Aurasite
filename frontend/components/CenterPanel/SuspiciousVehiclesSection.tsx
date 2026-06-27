import { Vehicle } from '@/types/vehicle';
import { SuspiciousVehiclesPanelIcon } from '@/components/NavIcons';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import PanelEmptyState from '@/components/shared/PanelEmptyState';
import Card from '../shared/Card';

/** Scroll viewport: 5 rows × 4rem + 4 gaps × 0.5rem; dashboard card total height is 27.5rem. */
const LIST_VIEWPORT_REM = 5 * 4 + 4 * 0.5;

interface Props {
  vehicles: Vehicle[];
  className?: string;
  /** Dashboard layout: fixed outer height, scrollable list inside. */
  fillHeight?: boolean;
}

export default function SuspiciousVehiclesSection({
  vehicles,
  className = '',
  fillHeight = false,
}: Props) {
  const cardClass = fillHeight
    ? 'flex h-full min-h-0 max-h-full shrink-0 flex-col overflow-hidden !h-full !min-h-0 !max-h-full'
    : 'shrink-0 overflow-hidden';

  return (
    <Card className={`suspicious-vehicles-section ${cardClass} ${className}`.trim()}>
      <PanelIconHeader
        icon={<SuspiciousVehiclesPanelIcon />}
        title="Suspicious Vehicles"
        subtitle="Plates flagged for review from recent detections."
        iconBg="bg-white/10"
        iconColor="text-white"
      />
      <div
        className={`suspicious-vehicles-scroll min-h-0 overflow-y-auto overflow-x-hidden pr-1 ${
          fillHeight ? 'flex-1' : 'shrink-0'
        } ${vehicles.length === 0 ? 'flex flex-col' : ''}`}
        style={
          fillHeight
            ? undefined
            : {
                height: `${LIST_VIEWPORT_REM}rem`,
                maxHeight: `${LIST_VIEWPORT_REM}rem`,
              }
        }
      >
        {vehicles.length === 0 ? (
          <PanelEmptyState message="No suspicious vehicles flagged" fill className="w-full" />
        ) : (
          <ul className="space-y-2">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="h-[4rem] shrink-0 rounded-lg border border-cyber-pink/25 bg-gradient-to-r from-cyber-pink/12 to-transparent px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-cyber-pink shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
                  <p className="truncate font-mono text-sm font-semibold tracking-wide text-cyber-pink">
                    {vehicle.plate_number}
                  </p>
                </div>
                <p className="mt-1.5 pl-[1.125rem] text-[11px] leading-snug text-slate-400">
                  {vehicle.flagged_reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
