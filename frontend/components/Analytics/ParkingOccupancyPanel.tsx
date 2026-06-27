'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ParkingOccupancyResult } from '@/types/analytics';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import { ParkingOccupancyPanelIcon } from '@/components/NavIcons';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';
import { useThemeStore } from '@/store/themeStore';
import {
  BROWN_CREAM_PARKING_CHART_GREEN,
  CYBERPUNK_PARKING_CHART_GREEN,
} from '@/theme/chartColors';

const CHART_GREEN_CYBER = CYBERPUNK_PARKING_CHART_GREEN;
const CHART_GREEN_CREAM = BROWN_CREAM_PARKING_CHART_GREEN;
const CHART_FILL_OPACITY = 0.72;

interface Props {
  data: ParkingOccupancyResult;
  maxCapacity: number;
  onCapacityChange: (value: number) => void;
  className?: string;
}

export default function ParkingOccupancyPanel({
  data,
  maxCapacity,
  onCapacityChange,
  className = '',
}: Props) {
  const theme = useThemeStore((state) => state.theme);
  const chartGreen = theme === 'brown-cream' ? CHART_GREEN_CREAM : CHART_GREEN_CYBER;
  const themeKey = theme === 'brown-cream' ? 'cream' : 'cyber';
  const animationKey = useChartAnimationKey(`parking-occupancy-${themeKey}`);
  const [capacityInput, setCapacityInput] = useState(String(maxCapacity));

  useEffect(() => {
    setCapacityInput(String(maxCapacity));
  }, [maxCapacity]);

  const peakPoint = useMemo(() => {
    return data.hourly.reduce<(typeof data.hourly)[0] | null>((best, point) => {
      if (point.hour === 24) return best;
      if (!best || point.occupancyPct >= best.occupancyPct) return point;
      return best;
    }, null);
  }, [data.hourly]);

  const isParkingFull = data.currentOccupied >= data.maxCapacity || data.available <= 0;

  const handleCapacityChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 4);
    setCapacityInput(digitsOnly);
  };

  const commitCapacity = () => {
    const parsed = Number.parseInt(capacityInput, 10);
    if (!capacityInput || !Number.isFinite(parsed) || parsed < 1) {
      setCapacityInput(String(maxCapacity));
      return;
    }
    const next = Math.min(9999, parsed);
    onCapacityChange(next);
    setCapacityInput(String(next));
  };

  return (
    <section
      className={`glass-panel flex min-h-[22rem] flex-col rounded-xl border border-white/5 p-4 sm:p-5 ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PanelIconHeader
          icon={<ParkingOccupancyPanelIcon />}
          title="Parking Occupancy"
          subtitle="Real-time lot utilization - capacity management"
          iconBg="bg-white/10"
          iconColor="text-white"
          className="!mb-0 min-w-0 flex-1"
        />

        <label className="parking-capacity-control group shrink-0">
          <span className="parking-capacity-control__label">Max Capacity</span>
          <div className="parking-capacity-control__field">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={capacityInput}
              onChange={(e) => handleCapacityChange(e.target.value)}
              onBlur={commitCapacity}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                  return;
                }
                if (['-', '+', '.', ',', 'e', 'E'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              className="parking-capacity-control__input"
              aria-label="Parking max capacity"
            />
            <span className="parking-capacity-control__unit">spaces</span>
          </div>
        </label>
      </header>

      <div key={animationKey} className="parking-occupancy-chart h-48 w-full sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.hourly} margin={{ top: 18, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(222, 220, 209, 0.08)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              ticks={data.axisLabels}
              tick={{ fill: '#c2c0b6', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(222, 220, 209, 0.15)' }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 60, 90]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#c2c0b6', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(10, 14, 39, 0.95)',
                border: '1px solid rgba(126, 211, 33, 0.5)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#c2c0b6' }}
              formatter={(value: number, _name, item) => [
                `${value}% (${item.payload.occupied}/${data.maxCapacity})`,
                'Occupancy',
              ]}
            />
            <Area
              type="monotone"
              dataKey="occupancyPct"
              stroke="none"
              fill={chartGreen}
              fillOpacity={CHART_FILL_OPACITY}
              isAnimationActive
              animationDuration={2200}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="occupancyPct"
              stroke={chartGreen}
              strokeWidth={3.5}
              dot={(props) => {
                const { cx, cy, payload } = props;
                if (!peakPoint || !payload || payload.hour !== peakPoint.hour || cx == null || cy == null) {
                  return <g />;
                }
                return (
                  <g>
                    <text
                      x={cx}
                      y={cy - 12}
                      textAnchor="middle"
                      fill={chartGreen}
                      fontSize={10}
                      fontWeight={600}
                      letterSpacing="0.08em"
                    >
                      PEAK
                    </text>
                    <circle cx={cx} cy={cy} r={5} fill={chartGreen} />
                  </g>
                );
              }}
              activeDot={{ r: 4, fill: chartGreen, stroke: chartGreen }}
              isAnimationActive
              animationDuration={2200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Current Usage"
          value={isParkingFull ? 'FULL' : `${data.currentPct}%`}
          detail={`${data.currentOccupied}/${data.maxCapacity} spaces`}
          valueClassName={isParkingFull ? 'parking-usage-full' : 'text-slate-100'}
        />
        <StatCard
          label="Peak Time"
          value={data.peakLabel}
          detail={
            data.isPeakAlert
              ? `${data.peakPct}% full - Alert`
              : `${data.peakPct}% full`
          }
        />
        <StatCard
          label="Available Now"
          value={String(data.available)}
          detail="spaces free"
          valueClassName="text-[#7ED321]"
        />
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  detail,
  valueClassName = 'text-slate-100',
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 font-orbitron text-2xl font-semibold leading-none ${valueClassName}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-slate-400">{detail}</p>
    </div>
  );
}
