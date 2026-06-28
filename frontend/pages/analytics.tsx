import { useEffect } from 'react';
import Header from '@/components/Header';
import PageTitle from '@/components/shared/PageTitle';
import PeakTrafficChart, {
  PEAK_TRAFFIC_HOURS_ANCHOR,
} from '@/components/LeftPanel/PeakTrafficChart';
import RepeatAnalysisWidget, {
  REPEAT_VEHICLE_ANALYSIS_ANCHOR,
} from '@/components/LeftPanel/RepeatAnalysisWidget';
import MostFrequentVehicles, {
  MOST_FREQUENT_VEHICLES_ANCHOR,
} from '@/components/LeftPanel/MostFrequentVehicles';
import VehicleSpeedPanel, { VEHICLE_SPEED_ANCHOR } from '@/components/Analytics/VehicleSpeedPanel';
import ParkingOccupancyPanel from '@/components/Analytics/ParkingOccupancyPanel';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';
import { useParkingCapacity } from '@/hooks/useParkingCapacity';
export default function AnalyticsPage() {
  const { maxCapacity, setMaxCapacity } = useParkingCapacity();
  const { traffic, repeat, frequent, speeds, parking, loading } = useAnalytics(maxCapacity);
  const peakTrafficKey = useChartAnimationKey('peak-traffic');
  const parkingOccupancyKey = useChartAnimationKey('parking-occupancy');

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;

    const hash = window.location.hash.replace('#', '');
    if (!hash) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  return (
    <div className="analytics-page cream-panel-icons min-h-screen">
      <Header />
      <main className="mobile-page-main mx-auto max-w-[1920px] space-y-6 px-6 py-6">
        {loading ? (
          <div className="glass-panel flex min-h-[24rem] items-center justify-center rounded-xl border border-dashed border-white/10">
            <p className="text-sm text-slate-500">Loading analytics...</p>
          </div>
        ) : (
          <div className="analytics-panel-enter space-y-6">
            <PageTitle title="Analytics Studio" subtitle="Traffic, confidence, and vehicle insights" />
            <div className="grid gap-6 xl:grid-cols-2">
              <PeakTrafficChart
                key={peakTrafficKey}
                data={traffic}
                sectionId={PEAK_TRAFFIC_HOURS_ANCHOR}
              />
              <VehicleSpeedPanel readings={speeds} className="h-full" sectionId={VEHICLE_SPEED_ANCHOR} />
              <RepeatAnalysisWidget
                data={repeat}
                variant="bars"
                className="h-full"
                sectionId={REPEAT_VEHICLE_ANALYSIS_ANCHOR}
              />
              <MostFrequentVehicles
                vehicles={frequent}
                variant="bars"
                className="h-full"
                sectionId={MOST_FREQUENT_VEHICLES_ANCHOR}
              />
            </div>
            <ParkingOccupancyPanel
              key={parkingOccupancyKey}
              data={parking}
              maxCapacity={maxCapacity}
              onCapacityChange={setMaxCapacity}
            />
          </div>
        )}
      </main>
    </div>
  );
}
