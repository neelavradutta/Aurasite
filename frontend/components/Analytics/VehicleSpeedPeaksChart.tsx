'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VehicleSpeedReading } from '@/utils/speedEstimation';
import { useChartAnimationKey } from '@/hooks/useChartAnimationKey';
import { useThemeStore } from '@/store/themeStore';
import { BROWN_CREAM, isCreamTheme } from '@/theme/themeColors';
import { formatDateTimeShort } from '@/utils/dateFormat';

const VIEW_W = 800;
const VIEW_H = 350;
const VIEW_PAD_TOP = 42;
const VIEW_PAD_SIDE = 24;
const CHART_LEFT = 72;
const CHART_RIGHT = 728;
const CHART_BASE_Y = 300;
const CHART_MIN_Y = 92;
const MAX_POINTS = 16;

interface ChartPoint {
  x: number;
  y: number;
  reading: VehicleSpeedReading;
}

const LABEL_BOX_H = 60;
const LABEL_DOT_GAP = 18;
const LABEL_BOX_MIN_W = 104;
const LABEL_BOX_MAX_W = 190;
const LABEL_CHAR_W = 11;
const TOOLTIP_GAP = 8;
const TOOLTIP_PAD = 8;

function selectChartReadings(readings: VehicleSpeedReading[]): VehicleSpeedReading[] {
  return [...readings]
    .sort((a, b) => {
      const timeDiff = new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.detection_id - b.detection_id;
    })
    .slice(0, MAX_POINTS);
}

function getVisualSpeedScale(minSpeed: number, maxSpeed: number): { base: number; span: number } {
  const dataSpan = maxSpeed - minSpeed;
  const lowBand = maxSpeed <= 20;

  if (lowBand) {
    // Tighter Y scale for low speeds so small differences read as taller peaks.
    const span = Math.max(dataSpan * 0.38, maxSpeed * 0.1, 0.55);
    return { base: minSpeed, span };
  }

  return { base: minSpeed, span: Math.max(dataSpan, 8) };
}

function buildChartPoints(readings: VehicleSpeedReading[]): ChartPoint[] {
  const sample = selectChartReadings(readings);
  if (sample.length === 0) return [];

  const speeds = sample.map((r) => r.speed_kmh);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const dataSpan = maxSpeed - minSpeed;
  const { base, span } = getVisualSpeedScale(minSpeed, maxSpeed);
  const chartHeight = CHART_BASE_Y - CHART_MIN_Y;

  const xSpan = CHART_RIGHT - CHART_LEFT;
  const step = sample.length === 1 ? 0 : xSpan / (sample.length - 1);

  return sample.map((reading, index) => {
    const x = sample.length === 1 ? CHART_LEFT + xSpan / 2 : CHART_LEFT + step * index;
    const t =
      dataSpan < 0.01
        ? 0.58
        : Math.min(1, Math.max(0, (reading.speed_kmh - base) / span));
    const y = CHART_BASE_Y - t * chartHeight;
    return {
      x,
      y,
      reading,
    };
  });
}

function pointsToPolyline(points: ChartPoint[]): string {
  if (points.length === 1) {
    const p = points[0];
    return `${p.x - 30},${p.y} ${p.x + 30},${p.y}`;
  }
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function pointsToFillPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x - 30},${CHART_BASE_Y} L ${p.x - 30},${p.y} L ${p.x + 30},${p.y} L ${p.x + 30},${CHART_BASE_Y} Z`;
  }
  const line = points.map((p) => `L ${p.x},${p.y}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  return `M ${first.x},${CHART_BASE_Y} ${line} L ${last.x},${CHART_BASE_Y} L ${first.x},${CHART_BASE_Y} Z`;
}

function formatSpeed(speed: number): string {
  return Number.isInteger(speed) ? `${speed}` : speed.toFixed(1);
}

function formatMeasuredAt(iso: string): string {
  return formatDateTimeShort(iso, iso);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function svgPointToLocal(
  svg: SVGSVGElement,
  container: HTMLElement,
  x: number,
  y: number,
): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return { x: container.clientWidth / 2, y: container.clientHeight / 2 };
  }
  const screen = point.matrixTransform(matrix);
  const containerRect = container.getBoundingClientRect();
  return {
    x: screen.x - containerRect.left,
    y: screen.y - containerRect.top,
  };
}

function fitTooltipInChart(
  chart: HTMLElement,
  tooltip: HTMLElement,
  anchorX: number,
  anchorY: number,
  placement: 'above' | 'below' | 'center',
): { left: number; top: number } {
  const containerW = chart.clientWidth;
  const containerH = chart.clientHeight;
  const tooltipW = tooltip.offsetWidth;
  const tooltipH = tooltip.offsetHeight;

  let left = anchorX - tooltipW / 2;
  let top =
    placement === 'above'
      ? anchorY - tooltipH
      : placement === 'below'
        ? anchorY
        : anchorY - tooltipH / 2;

  left = clamp(left, TOOLTIP_PAD, containerW - tooltipW - TOOLTIP_PAD);
  top = clamp(top, TOOLTIP_PAD, containerH - tooltipH - TOOLTIP_PAD);

  return { left, top };
}

function isTooltipInsideChart(
  chart: HTMLElement,
  tooltip: HTMLElement,
  pos: { left: number; top: number },
): boolean {
  const containerW = chart.clientWidth;
  const containerH = chart.clientHeight;
  const tooltipW = tooltip.offsetWidth;
  const tooltipH = tooltip.offsetHeight;

  return (
    pos.left >= TOOLTIP_PAD &&
    pos.top >= TOOLTIP_PAD &&
    pos.left + tooltipW <= containerW - TOOLTIP_PAD &&
    pos.top + tooltipH <= containerH - TOOLTIP_PAD
  );
}

function resolveTooltipPosition(
  chart: HTMLElement,
  svg: SVGSVGElement,
  point: ChartPoint,
): { left: number; top: number } {
  const tooltip = chart.querySelector<HTMLElement>('.vehicle-speed-peaks__tooltip');
  if (!tooltip) {
    return { left: TOOLTIP_PAD, top: TOOLTIP_PAD };
  }

  const labelTop = point.y - LABEL_BOX_H - LABEL_DOT_GAP;
  const placements: Array<{ x: number; y: number; placement: 'above' | 'below' | 'center' }> = [
    {
      x: point.x,
      y: labelTop - TOOLTIP_GAP,
      placement: 'above',
    },
    {
      x: point.x,
      y: point.y + TOOLTIP_GAP + 11,
      placement: 'below',
    },
    {
      x: point.x,
      y: (labelTop + point.y) / 2,
      placement: 'center',
    },
  ];

  for (const candidate of placements) {
    const local = svgPointToLocal(svg, chart, candidate.x, candidate.y);
    const pos = fitTooltipInChart(chart, tooltip, local.x, local.y, candidate.placement);
    if (isTooltipInsideChart(chart, tooltip, pos)) return pos;
  }

  const fallbackLocal = svgPointToLocal(svg, chart, point.x, labelTop - TOOLTIP_GAP);
  return fitTooltipInChart(chart, tooltip, fallbackLocal.x, fallbackLocal.y, 'above');
}

export default function VehicleSpeedPeaksChart({ readings }: { readings: VehicleSpeedReading[] }) {
  const theme = useThemeStore((state) => state.theme);
  const cream = isCreamTheme(theme);
  const colors = cream ? BROWN_CREAM : null;
  const animationKey = useChartAnimationKey(`vehicle-speed-peaks-${cream ? 'cream' : 'cyber'}`);
  const points = useMemo(() => buildChartPoints(readings), [readings]);
  const chartMountKey = useMemo(() => {
    if (readings.length === 0) return animationKey;
    return readings.map((reading) => `${reading.detection_id}:${reading.speed_kmh}`).join('|');
  }, [readings, animationKey]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] ?? null : null;

  useLayoutEffect(() => {
    if (hoveredPoint === null) {
      setTooltipPos(null);
      return;
    }

    const chart = chartRef.current;
    const svg = svgRef.current;
    if (!chart || !svg) return;

    const updatePosition = () => {
      setTooltipPos(resolveTooltipPosition(chart, svg, hoveredPoint));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [hoveredPoint, chartMountKey]);

  if (points.length === 0) return null;

  const polyline = pointsToPolyline(points);
  const fillPath = pointsToFillPath(points);
  const labelStagger = points.length > 1 ? 2.5 / points.length : 0;
  const chartId = chartMountKey.replace(/[^a-zA-Z0-9-_]/g, '');

  return (
    <div key={chartMountKey} className="vehicle-speed-peaks h-full min-h-0">
      <div ref={chartRef} className="vehicle-speed-peaks__chart">
        <svg
          ref={svgRef}
          viewBox={`-${VIEW_PAD_SIDE} -${VIEW_PAD_TOP} ${VIEW_W + VIEW_PAD_SIDE * 2} ${VIEW_H + VIEW_PAD_TOP}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
        >
          <defs>
            <clipPath id={`vsp-clip-${chartId}`}>
              <path d={fillPath} />
            </clipPath>
            <linearGradient
              id={`vsp-mountain-${chartId}`}
              x1="0"
              y1={CHART_MIN_Y}
              x2="0"
              y2={CHART_BASE_Y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={colors?.speedMountainTop ?? 'rgba(0, 245, 212, 0.82)'} />
              <stop offset="38%" stopColor={colors?.speedMountainMid ?? 'rgba(0, 245, 212, 0.58)'} />
              <stop offset="72%" stopColor={colors?.speedMountainLow ?? 'rgba(0, 245, 212, 0.26)'} />
              <stop offset="100%" stopColor={colors?.speedMountainFade ?? 'rgba(0, 245, 212, 0.04)'} />
            </linearGradient>
            <linearGradient
              id={`vsp-mountain-glow-${chartId}`}
              x1="0"
              y1={CHART_MIN_Y}
              x2="0"
              y2={CHART_BASE_Y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={colors?.speedGlowTop ?? 'rgba(110, 255, 238, 0.72)'} />
              <stop offset="45%" stopColor={colors?.speedGlowMid ?? 'rgba(0, 245, 212, 0.42)'} />
              <stop offset="100%" stopColor={colors?.speedGlowFade ?? 'rgba(0, 245, 212, 0.02)'} />
            </linearGradient>
            <linearGradient id={`vsp-sweep-${chartId}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(122, 75, 34, 0)" />
              <stop
                offset="50%"
                stopColor={cream ? 'rgba(185, 128, 79, 0.32)' : 'rgba(77, 248, 229, 0.38)'}
              />
              <stop
                offset="100%"
                stopColor={cream ? 'rgba(122, 75, 34, 0.18)' : 'rgba(255, 255, 255, 0.22)'}
              />
            </linearGradient>
            <filter
              id={`vsp-glow-${chartId}`}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="3.5" result="blur" />
            </filter>
          </defs>

          <g className="vehicle-speed-peaks__mountain">
            <g
              className="vehicle-speed-peaks__glow"
              filter={`url(#vsp-glow-${chartId})`}
            >
              <path
                className="vehicle-speed-peaks__fill-glow"
                d={fillPath}
                fill={`url(#vsp-mountain-glow-${chartId})`}
                stroke="none"
              />
              <polyline
                className="vehicle-speed-peaks__line-glow"
                points={polyline}
                fill="none"
                stroke={colors?.speedStrokeGlow ?? '#4df8e5'}
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            <path
              className="vehicle-speed-peaks__fill"
              d={fillPath}
              fill={`url(#vsp-mountain-${chartId})`}
              stroke="none"
            />

            <polyline
              className="vehicle-speed-peaks__line"
              points={polyline}
              fill="none"
              stroke={colors?.speedStroke ?? '#00F5D4'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <g
              className="vehicle-speed-peaks__sweep-wrap"
              clipPath={`url(#vsp-clip-${chartId})`}
            >
              <rect
                className="vehicle-speed-peaks__sweep"
                x={CHART_LEFT - 20}
                y={CHART_BASE_Y}
                width={CHART_RIGHT - CHART_LEFT + 40}
                height="28"
                fill={`url(#vsp-sweep-${chartId})`}
              />
            </g>
          </g>

          <g
            className={`vehicle-speed-peaks__points${hoveredIndex !== null ? ' vehicle-speed-peaks__points--interacting' : ''}`}
          >
            {points.map((point, index) => {
              const plateLabel =
                point.reading.plate_number.length > 15
                  ? `${point.reading.plate_number.slice(0, 15)}...`
                  : point.reading.plate_number;
              const labelW = Math.min(
                LABEL_BOX_MAX_W,
                Math.max(LABEL_BOX_MIN_W, plateLabel.length * LABEL_CHAR_W + 22)
              );
              const halfW = labelW / 2;
              const labelCenterX = Math.min(
                VIEW_W - VIEW_PAD_SIDE - halfW,
                Math.max(VIEW_PAD_SIDE + halfW, point.x)
              );
              const labelTop = point.y - LABEL_BOX_H - LABEL_DOT_GAP;
              const delay = labelStagger * (index + 1);
              const isHovered = hoveredIndex === index;

              return (
                <g
                  key={`${point.reading.detection_id}-${point.reading.plate_number}-${index}`}
                  className={`vehicle-speed-peaks__point${isHovered ? ' vehicle-speed-peaks__point--hover' : ''}`}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <rect
                    className="vehicle-speed-peaks__hit"
                    x={labelCenterX - halfW - 6}
                    y={labelTop - 6}
                    width={labelW + 12}
                    height={LABEL_BOX_H + LABEL_DOT_GAP + 18}
                    rx={6}
                  />
                  <rect
                    className="vehicle-speed-peaks__label-box"
                    x={labelCenterX - halfW}
                    y={labelTop}
                    width={labelW}
                    height={LABEL_BOX_H}
                    style={{ animationDelay: `${delay}s` }}
                  />
                  <text
                    className="vehicle-speed-peaks__label"
                    x={labelCenterX}
                    y={labelTop + 22}
                    textAnchor="middle"
                    style={{ animationDelay: `${delay}s` }}
                    pointerEvents="none"
                  >
                    {plateLabel}
                  </text>
                  <text
                    className="vehicle-speed-peaks__label"
                    x={labelCenterX}
                    y={labelTop + 44}
                    textAnchor="middle"
                    style={{ animationDelay: `${delay}s` }}
                    pointerEvents="none"
                  >
                    {formatSpeed(point.reading.speed_kmh)} km/h
                  </text>
                  <circle
                    className="vehicle-speed-peaks__dot"
                    cx={point.x}
                    cy={point.y}
                    r="6.5"
                    fill={colors?.speedPeakFill ?? '#FFD700'}
                    stroke={colors?.speedPeakStroke ?? '#FFFFFF'}
                    strokeWidth="2"
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {hoveredPoint && (
          <div
            className="vehicle-speed-peaks__tooltip"
            style={
              tooltipPos
                ? { left: `${tooltipPos.left}px`, top: `${tooltipPos.top}px`, visibility: 'visible' }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
            role="tooltip"
          >
            <p className="vehicle-speed-peaks__tooltip-plate">{hoveredPoint.reading.plate_number}</p>
            <p className="vehicle-speed-peaks__tooltip-speed">
              {formatSpeed(hoveredPoint.reading.speed_kmh)} km/h
            </p>
            <p className="vehicle-speed-peaks__tooltip-source" title={hoveredPoint.reading.source_label}>
              {hoveredPoint.reading.source_label}
            </p>
            <p className="vehicle-speed-peaks__tooltip-time">
              {formatMeasuredAt(hoveredPoint.reading.measured_at)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
