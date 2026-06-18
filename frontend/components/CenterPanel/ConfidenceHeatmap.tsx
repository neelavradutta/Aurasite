'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, TooltipProps } from 'recharts';
import Card from '../shared/Card';
import { ConfidenceBand } from '@/types/analytics';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';

const COLORS = ['#84ff00', '#00f7ff', '#d946ef', '#ff006e'];

function HeatmapTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload as ConfidenceBand;
  return (
    <div className="confidence-heatmap-tooltip min-w-[120px] rounded-md border border-cyber-cyan/40 bg-[#0a1028] px-3 py-2 text-sm leading-snug shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <p className="text-center font-orbitron text-sm font-semibold tracking-wide text-cyber-cyan">
        {item.percentage}%
      </p>
      <p className="mt-1 text-slate-200">
        {item.count} detection{item.count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function AnimatedConfidencePie({
  data,
  compact,
  width,
  height,
}: {
  data: ConfidenceBand[];
  compact: boolean;
  width?: number;
  height?: number;
}) {
  const animationKey = useChartAnimationKey('confidence-heatmap-pie');

  return (
    <div key={animationKey} className="pie-chart-sweep h-full w-full overflow-visible">
      <PieChart
        width={width}
        height={height}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Pie
          data={data}
          dataKey="count"
          nameKey="band"
          cx="50%"
          cy={compact ? '50%' : '43%'}
          innerRadius={compact ? 88 : 66}
          outerRadius={compact ? 125 : 96}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          content={<HeatmapTooltip />}
          offset={compact ? 16 : 22}
          allowEscapeViewBox={{ x: true, y: true }}
          reverseDirection={{ x: true, y: true }}
          wrapperStyle={{ zIndex: 60, pointerEvents: 'none', outline: 'none' }}
        />
        {!compact ? (
          <Legend verticalAlign="bottom" iconSize={10} wrapperStyle={{ fontSize: 14, paddingTop: 4 }} />
        ) : null}
      </PieChart>
    </div>
  );
}

export default function ConfidenceHeatmap({
  data,
  className = '',
  compact = false,
}: {
  data: ConfidenceBand[];
  className?: string;
  /** Tighter fit for dashboard — no extra empty space around the chart. */
  compact?: boolean;
}) {
  return (
    <Card
      className={`flex h-full min-h-0 max-h-full flex-col ${compact ? '!p-5' : '!p-3'} overflow-hidden ${className}`.trim()}
    >
      <header className="mb-3 shrink-0">
        <h3 className="section-title">Confidence Heatmap</h3>
        <p className="mt-0.5 w-full truncate text-[10px] text-nowrap text-slate-500">
          Share of detections grouped by confidence level.
        </p>
      </header>
      {data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-slate-500">No confidence metrics yet</p>
        </div>
      ) : compact ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-visible">
          <div className="h-[18rem] w-[18rem] shrink-0 overflow-visible sm:h-[19rem] sm:w-[19rem]">
            <ResponsiveContainer width="100%" height="100%">
              <AnimatedConfidencePie data={data} compact />
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {data.map((band, index) => (
              <li key={band.band} className="flex items-center gap-2 text-sm text-slate-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{band.band}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="h-64 overflow-visible">
          <ResponsiveContainer width="100%" height="100%">
            <AnimatedConfidencePie data={data} compact={false} />
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
