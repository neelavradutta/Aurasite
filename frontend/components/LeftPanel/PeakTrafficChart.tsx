'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrafficHour } from '@/types/analytics';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';
import { useThemeStore } from '@/store/themeStore';
import {
  BROWN_CREAM_PEAK_TRAFFIC_COLORS,
  BROWN_CREAM_PEAK_TRAFFIC_TRACK,
  CYBERPUNK_PEAK_TRAFFIC_COLORS,
  CYBERPUNK_PEAK_TRAFFIC_TRACK,
} from '@/theme/chartColors';
import { formatHourSlot } from '@/utils/timeFormat';
import { selectTopTrafficIntervals } from '@/utils/sessionAnalytics';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import PanelEmptyState from '@/components/shared/PanelEmptyState';
import PeakTrafficHoursLogo from '@/components/PeakTrafficHoursLogo';

export const PEAK_TRAFFIC_HOURS_ANCHOR = 'peak-traffic-hours';

const INTERVAL_COLORS_CYBER = [...CYBERPUNK_PEAK_TRAFFIC_COLORS];
const INTERVAL_COLORS_CREAM = [...BROWN_CREAM_PEAK_TRAFFIC_COLORS];
const INTERVAL_COLORS_CREAM_ANALYTICS = [
  '#7a4b22',
  '#5c9d55',
  '#c35a45',
  '#d29a35',
  '#6f8f6b',
  '#b9804f',
  '#8f6a4d',
  '#d8b07a',
] as const;

function buildIntervalColorByHour(
  intervals: TrafficHour[],
  palette: readonly string[],
): Map<number, string> {
  const chronological = [...intervals]
    .filter((item) => item.count > 0)
    .sort((a, b) => a.hour - b.hour);

  const colorByHour = new Map<number, string>();
  chronological.forEach((interval, rank) => {
    colorByHour.set(interval.hour, palette[rank % palette.length]);
  });
  return colorByHour;
}

function getIntervalColor(
  colorByHour: Map<number, string>,
  hour: number,
  palette: readonly string[],
): string {
  return colorByHour.get(hour) ?? palette[0];
}

const PEAK_MAX_INTERVALS = 8;
const PEAK_INTERVALS_PER_COLUMN = 4;
/** Fixed layout footprint — pie is scaled up visually without growing the panel. */
const PIE_LAYOUT_SIZE = { default: 240, large: 256 } as const;
const PIE_DISPLAY_SCALE = 1.2;

interface Props {
  data: TrafficHour[];
  className?: string;
  centered?: boolean;
  size?: 'default' | 'lg';
  variant?: 'chart' | 'table';
  /** Dashboard table preview: top N busiest intervals. */
  limit?: number;
  /** When set, the whole panel links to analytics (or another route). */
  href?: string;
  /** Anchor id for scroll targets on the analytics page. */
  sectionId?: string;
}

export default function PeakTrafficChart({
  data,
  className = '',
  centered = false,
  size = 'default',
  variant = 'chart',
  limit = 3,
  href,
  sectionId,
}: Props) {
  const theme = useThemeStore((state) => state.theme);
  const intervalColors =
    theme === 'brown-cream'
      ? variant === 'chart'
        ? INTERVAL_COLORS_CREAM_ANALYTICS
        : INTERVAL_COLORS_CREAM
      : INTERVAL_COLORS_CYBER;
  const trackColor =
    theme === 'brown-cream' ? BROWN_CREAM_PEAK_TRAFFIC_TRACK : CYBERPUNK_PEAK_TRAFFIC_TRACK;
  const themeKey = theme === 'brown-cream' ? 'cream' : 'cyber';

  const isLarge = size === 'lg';
  const tableRowLimit = variant === 'table' ? 3 : limit;
  const activeIntervals = [...data]
    .filter((item) => item.count > 0)
    .sort((a, b) => a.hour - b.hour);
  const peakIntervals = trimPeakIntervals(activeIntervals, PEAK_MAX_INTERVALS);
  const intervalColorByHour = buildIntervalColorByHour(data, intervalColors);

  const peak =
    [...data]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)[0] ?? null;

  const topTableIntervals = selectTopTrafficIntervals(data, tableRowLimit);

  const maxIntervalCount = peak?.count ?? 1;
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const peakSlot = peak ? formatHourSlot(peak.hour) : '--';
  const peakCount = peak?.count ?? 0;
  const topIntervalsTotal = peakIntervals.reduce((sum, item) => sum + item.count, 0);
  const otherCount = Math.max(total - topIntervalsTotal, 0);

  const chartData =
    peak && total > 0
      ? [
          ...peakIntervals.map((interval) => ({
            name: formatHourSlot(interval.hour),
            value: interval.count,
            color: getIntervalColor(intervalColorByHour, interval.hour, intervalColors),
          })),
          ...(otherCount > 0
            ? [{ name: 'Other', value: otherCount, color: trackColor }]
            : []),
        ]
      : [{ name: 'Empty', value: 1, color: trackColor }];

  const rowBoxClass = isLarge ? 'px-3.5 py-2.5' : 'px-3 py-2';
  const rowMinHeightClass =
    variant === 'table'
      ? isLarge
        ? 'min-h-[3.75rem]'
        : 'min-h-[3.5rem]'
      : isLarge
        ? 'min-h-[4.25rem]'
        : 'min-h-[4rem]';
  const isDashboardTable = variant === 'table' && href;

  const panel = (
    <section
      id={sectionId}
      className={`glass-panel flex flex-col rounded-xl border border-white/5 ${
        isDashboardTable
          ? 'flex h-[27.5rem] min-h-[27.5rem] max-h-[27.5rem] shrink-0 flex-col px-4 pt-4 !pb-2.5'
          : isLarge
            ? 'min-h-[17.5rem] p-4'
            : 'min-h-[14.5rem] p-4'
      } ${sectionId ? 'scroll-mt-24' : ''} ${
        href ? 'transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]' : ''
      } ${href ? '' : className}`}
    >
      <PanelIconHeader
        icon={<PeakTrafficHoursLogo className="h-full w-full" />}
        title="Peak Traffic Hours"
        subtitle="Grouped by hour for the busiest time slots."
        iconBg="peak-traffic-hours-logo-box"
        iconColor=""
        iconBoxClassName="h-8 w-8 overflow-hidden"
      />

      {variant === 'table' ? (
        <div className={`flex flex-1 flex-col ${isLarge ? 'space-y-3.5' : 'space-y-3'}`}>
          {topTableIntervals.length === 0 ? (
            <PanelEmptyState message="No traffic data in the last 24h" fill />
          ) : (
            topTableIntervals.map((interval) => (
              <div
                key={interval.hour}
                className={`flex items-center justify-between gap-3 rounded-lg border border-white/45 bg-black/20 ${rowBoxClass} ${rowMinHeightClass}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: getIntervalColor(
                        intervalColorByHour,
                        interval.hour,
                        intervalColors,
                      ),
                    }}
                    aria-hidden
                  />
                  <p
                    className={`truncate font-orbitron text-cyber-cyan ${
                      isLarge ? 'text-base' : 'text-sm'
                    }`}
                  >
                    {formatHourSlot(interval.hour)}
                  </p>
                </div>
                <p className={`shrink-0 whitespace-nowrap text-slate-300 ${isLarge ? 'text-sm' : 'text-xs'}`}>
                  {interval.count} vehicle{interval.count === 1 ? '' : 's'}
                </p>
              </div>
            ))
          )}
        </div>
      ) : data.length === 0 || !peak ? (
        <PanelEmptyState message="No traffic data in the last 24h" fill className="mt-3" />
      ) : centered ? (
        <div className="mt-2 grid min-h-0 w-full flex-1 place-items-center overflow-visible">
          <PeakDonutChartSlot
            chartData={chartData}
            peakSlot={peakSlot}
            peakCount={peakCount}
            large={isLarge}
            themeKey={themeKey}
          />
        </div>
      ) : (
        <div
          className={`peak-traffic-donut-row mt-2 flex flex-1 justify-start gap-6 overflow-visible sm:gap-8 ${
            peakIntervals.length > 4 ? 'items-start' : 'items-center'
          }`}
        >
          <div className="ml-8 shrink-0 overflow-visible sm:ml-10">
            <PeakDonutChartSlot
              chartData={chartData}
              peakSlot={peakSlot}
              peakCount={peakCount}
              large={isLarge}
              themeKey={themeKey}
            />
          </div>
          <PeakIntervalLegend
            intervals={peakIntervals}
            maxIntervalCount={maxIntervalCount}
            intervalColorByHour={intervalColorByHour}
            intervalColors={intervalColors}
          />
        </div>
      )}

      {href ? (
        <p className="mb-0 mt-auto shrink-0 pt-3 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover:text-cyber-cyan/80">
          View full analytics
        </p>
      ) : null}
    </section>
  );

  if (!href) return panel;

  return (
    <Link
      href={href}
      className={`group block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50 ${
        variant === 'table' ? '' : 'min-h-0'
      } ${className}`}
      aria-label="Open Peak Traffic Hours in Analytics"
    >
      {panel}
    </Link>
  );
}

type DonutSegment = { name: string; value: number; color: string };

function formatSegmentPercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  const percent = (value / total) * 100;
  if (percent > 0 && percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function PeakDonutChartSlot({
  chartData,
  peakSlot,
  peakCount,
  large = false,
  themeKey,
}: {
  chartData: DonutSegment[];
  peakSlot: string;
  peakCount: number;
  large?: boolean;
  themeKey: string;
}) {
  const layoutSize = large ? PIE_LAYOUT_SIZE.large : PIE_LAYOUT_SIZE.default;

  return (
    <div
      className="shrink-0 overflow-visible"
      style={{ width: layoutSize, height: layoutSize }}
    >
      <div
        className="flex h-full w-full origin-center items-center justify-center overflow-visible"
        style={{ transform: `scale(${PIE_DISPLAY_SCALE})` }}
      >
        <PeakDonutChart
          chartData={chartData}
          peakSlot={peakSlot}
          peakCount={peakCount}
          large={large}
          themeKey={themeKey}
        />
      </div>
    </div>
  );
}

function PeakDonutChart({
  chartData,
  peakSlot,
  peakCount,
  large = false,
  themeKey,
}: {
  chartData: DonutSegment[];
  peakSlot: string;
  peakCount: number;
  large?: boolean;
  themeKey: string;
}) {
  const animationKey = useChartAnimationKey(`peak-traffic-pie-${themeKey}`);
  const isCream = themeKey === 'cream';
  const subtextColor = isCream ? '#8e7868' : '#6c7a9c';
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const size = large ? 256 : 240;
  const inner = large ? 84 : 78;
  const outer = large ? 106 : 100;
  const r = (inner + outer) / 2;
  const strokeWidth = outer - inner;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const segmentGap = large ? 3 : 2.5;
  const hasMultipleSegments = chartData.length > 1;
  const totalGapSpace = hasMultipleSegments ? chartData.length * segmentGap : 0;
  const drawableCircumference = circumference - totalGapSpace;

  let currentOffset = 0;
  const segments: Array<
    DonutSegment & { strokeLength: number; gapLength: number; startingOffset: number }
  > = [];

  chartData.forEach((segment) => {
    const strokeLength =
      total > 0 ? (segment.value / total) * drawableCircumference : 0;
    const gapLength = circumference - strokeLength;
    const startingOffset = -currentOffset;
    segments.push({ ...segment, strokeLength, gapLength, startingOffset });
    currentOffset += strokeLength;

    if (hasMultipleSegments) {
      currentOffset += segmentGap;
    }
  });

  const dataKey = chartData.map((s) => `${s.name}:${s.value}:${s.color}`).join('|');
  const chartKey = `${animationKey}-${dataKey}`;
  const hoveredSegment = hoveredIndex !== null ? segments[hoveredIndex] : null;

  return (
    <div
      className={`relative shrink-0 ${large ? 'h-64 w-64' : 'h-60 w-60'}`}
      style={{ width: size, height: size }}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <div className="peak-scifi-donut h-full w-full">
        <svg
          key={chartKey}
          viewBox={`0 0 ${size} ${size}`}
          className="peak-scifi-donut__svg"
        >
          <circle
            className="peak-scifi-donut__ring-bg"
            cx={cx}
            cy={cy}
            r={r}
            strokeWidth={strokeWidth}
          />
          {segments.map((segment, index) => {
            const isHovered = hoveredIndex === index;
            const isDimmed = hoveredIndex !== null && !isHovered;

            return (
              <g key={`${segment.name}-${index}`}>
                <circle
                  className="peak-scifi-donut__segment"
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${segment.strokeLength} ${segment.gapLength}`}
                  style={{
                    ['--donut-circumference' as string]: String(circumference),
                    ['--donut-offset-end' as string]: String(segment.startingOffset),
                    animationDelay: `${100 + index * 80}ms`,
                    filter: isHovered
                      ? `drop-shadow(0 0 8px ${segment.color})`
                      : `drop-shadow(0 0 4px ${segment.color})`,
                    opacity: isDimmed ? 0.35 : 1,
                  }}
                />
                <circle
                  className="peak-scifi-donut__segment-hit"
                  cx={cx}
                  cy={cy}
                  r={r}
                  strokeWidth={strokeWidth + 14}
                  strokeDasharray={`${segment.strokeLength} ${segment.gapLength}`}
                  style={{ strokeDashoffset: segment.startingOffset }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  aria-label={`${segment.name}: ${formatSegmentPercent(segment.value, total)}, ${segment.value} vehicle${segment.value === 1 ? '' : 's'}`}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center">
        {hoveredSegment ? (
          <>
            <p
              className={`font-orbitron font-black leading-tight ${
                large ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
              }`}
              style={{
                color: hoveredSegment.color,
                letterSpacing: '2px',
                textShadow: isCream ? 'none' : `0 0 14px ${hoveredSegment.color}`,
              }}
            >
              {formatSegmentPercent(hoveredSegment.value, total)}
            </p>
            <p
              className={`font-orbitron font-black uppercase ${
                large ? 'text-[11px] tracking-[0.35em]' : 'text-[10px] tracking-[0.3em]'
              }`}
              style={{ color: subtextColor }}
            >
              {hoveredSegment.value} vehicle{hoveredSegment.value === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <>
            <p
              className={`font-orbitron font-black leading-tight text-cyber-cyan ${
                large ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
              }`}
              style={{
                letterSpacing: '2px',
                textShadow: isCream ? 'none' : '0 0 12px rgba(0, 255, 255, 0.6)',
              }}
            >
              {peakSlot}
            </p>
            <p
              className={`font-orbitron font-black uppercase ${
                large ? 'text-[11px] tracking-[0.35em]' : 'text-[10px] tracking-[0.3em]'
              }`}
              style={{ color: subtextColor }}
            >
              {peakCount} vehicles
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function trimPeakIntervals(intervals: TrafficHour[], maxIntervals: number): TrafficHour[] {
  if (intervals.length <= maxIntervals) return intervals;
  return intervals.slice(intervals.length - maxIntervals);
}

function chunkPeakIntervals<T>(items: T[], columnSize: number): T[][] {
  const columns: T[][] = [];
  for (let i = 0; i < items.length; i += columnSize) {
    columns.push(items.slice(i, i + columnSize));
  }
  return columns;
}

function PeakIntervalLegend({
  intervals,
  maxIntervalCount,
  intervalColorByHour,
  intervalColors,
}: {
  intervals: TrafficHour[];
  maxIntervalCount: number;
  intervalColorByHour: Map<number, string>;
  intervalColors: readonly string[];
}) {
  const columns = chunkPeakIntervals(intervals, PEAK_INTERVALS_PER_COLUMN);
  const useFixedColumns = intervals.length > PEAK_INTERVALS_PER_COLUMN;

  return (
    <div
      className={`flex min-w-0 flex-1 shrink ${
        useFixedColumns ? 'items-start justify-end' : 'shrink-0 items-center justify-center'
      }`}
    >
      <div className={`flex ${useFixedColumns ? 'items-start justify-end gap-3' : ''}`}>
        {columns.map((columnIntervals, columnIndex) => (
          <div
            key={`peak-interval-column-${columnIndex}`}
            className="w-fit min-w-[148px] rounded-lg border border-white/5 bg-black/25 px-4 py-3"
          >
            <div className="flex flex-col gap-3">
              {columnIntervals.map((interval, index) => (
                  <PeakIntervalStack
                    key={interval.hour}
                    slot={formatHourSlot(interval.hour)}
                    sharePct={Math.round((interval.count / maxIntervalCount) * 100)}
                    color={getIntervalColor(intervalColorByHour, interval.hour, intervalColors)}
                    stacked={columnIntervals.length > 1}
                    isLast={index === columnIntervals.length - 1}
                  />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeakIntervalStack({
  slot,
  sharePct,
  color,
  stacked,
  isLast,
}: {
  slot: string;
  sharePct: number;
  color: string;
  stacked: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2.5 ${
        stacked && !isLast ? 'border-b border-white/10 pb-3' : ''
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-nowrap text-sm font-medium text-slate-300">{slot}</span>
      </div>
      <div className="h-1.5 w-[118px] overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full max-w-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, sharePct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
