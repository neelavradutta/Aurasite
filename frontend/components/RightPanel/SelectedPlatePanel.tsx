import type { ReactNode } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import {
  LicensePlatePanelIcon,
  OwnerDetailIcon,
  PaletteDetailIcon,
  RupeeDetailIcon,
  VehiclesPanelIcon,
} from '@/components/NavIcons';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import {
  displayValue,
  getChallanPaid,
  getOwnerName,
  getPlateDisplay,
  getVehicleColour,
  getVehicleType,
} from '@/utils/detectionDisplay';
import { isAcceptedDetection } from '@/utils/dashboardDetections';

export default function SelectedPlatePanel() {
  const { selectedPlate } = useDashboardStore();
  const plate =
    selectedPlate && isAcceptedDetection(selectedPlate) ? selectedPlate : null;

  const plateNumber = getPlateDisplay(plate?.plate_number);
  const owner = plate ? getOwnerName(plate) : '--';
  const vehicleType = plate ? getVehicleType(plate) : '--';
  const colour = plate ? getVehicleColour(plate) : '--';
  const challanPaid = plate ? getChallanPaid(plate) : '--';

  return (
    <section className="glass-panel shrink-0 rounded-xl border border-white/5 p-5">
      <PanelIconHeader
        icon={<LicensePlatePanelIcon />}
        title="Selected Plate"
        iconBg="bg-white/10"
        iconColor="text-white"
      />

      <div className="rounded-xl border border-white/45 bg-black/20 px-4 py-9 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Plate Number</p>
        <p className="mt-3 font-orbitron text-3xl font-bold tracking-[0.35em] text-cyber-cyan neon-text">
          {plateNumber}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Owner" value={owner} icon={<OwnerDetailIcon />} />
        <DetailField label="Vehicle Type" value={vehicleType} icon={<VehiclesPanelIcon className="h-4 w-4 shrink-0" />} />
        <DetailField label="Colour" value={colour} icon={<PaletteDetailIcon />} />
        <DetailField label="Total Challan Paid" value={challanPaid} icon={<RupeeDetailIcon />} />
      </div>
    </section>
  );
}

function DetailField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-h-[88px] rounded-xl border border-white/45 bg-black/25 p-3">
      <div className="flex items-center gap-1.5 text-white">
        {icon}
        <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400">{label}</p>
      </div>
      <p className="mt-3 text-sm text-slate-200">{displayValue(value)}</p>
    </div>
  );
}
