import Link from 'next/link';
import { RepeatAnalysis } from '@/types/analytics';

export const REPEAT_VEHICLE_ANALYSIS_ANCHOR = 'repeat-vehicle-analysis';

interface Props {
  data: RepeatAnalysis | null;
  className?: string;
  variant?: 'boxes' | 'bars';
  /** Grow upward to fill column space; metrics stay at the bottom. */
  fillHeight?: boolean;
  /** Narrow dashboard split layout beside Vehicle Speed. */
  compact?: boolean;
  /** When set, the whole panel links to analytics (or another route). */
  href?: string;
  /** Anchor id for scroll targets on the analytics page. */
  sectionId?: string;
}



export default function RepeatAnalysisWidget({
  data,
  className = '',
  variant = 'boxes',
  fillHeight = false,
  compact = false,
  href,
  sectionId,
}: Props) {

  const unique = data?.unique_vehicles ?? 0;

  const repeat = data?.repeat_vehicles ?? 0;

  const mostActiveValue = data?.most_active_plate ?? '--';

  const panel = (
    <section
      id={sectionId}
      className={`glass-panel flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-xl border border-white/5 ${
        compact ? 'p-3' : 'p-4'
      } ${variant === 'bars' ? 'relative' : ''} ${sectionId ? 'scroll-mt-24' : ''} ${
        href ? 'transition hover:border-cyber-cyan/30 hover:bg-white/[0.03]' : ''
      } ${href ? '' : className}`}
    >

      <header className={`shrink-0 ${compact ? 'mb-2' : 'mb-3'}`}>

        <h3 className="section-title">Repeat Vehicle Analysis</h3>

      </header>



      {variant === 'bars' ? (

        <>
          <RepeatBarChart
            unique={unique}
            repeat={repeat}
            mostActiveValue={mostActiveValue}
          />
        </>

      ) : (

        <div
          className={`grid grid-cols-3 text-center ${compact ? 'gap-2' : 'gap-3'}${
            fillHeight
              ? ` mt-auto min-h-0 flex-1 items-stretch${compact ? ' mb-2' : ''}`
              : ' shrink-0'
          }`}
        >
          <Metric label="Unique" value={unique} tall={fillHeight} compact={compact} />
          <Metric label="Repeat" value={repeat} tall={fillHeight} compact={compact} />
          <Metric label="Most Active" value={mostActiveValue} tall={fillHeight} compact={compact} />
        </div>

      )}

      {href ? (
        <p className="mb-0 mt-2 shrink-0 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover:text-cyber-cyan/80">
          View full analytics
        </p>
      ) : null}

    </section>
  );

  if (!href) return panel;

  return (
    <Link
      href={href}
      className={`group block min-h-0 min-w-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber-cyan/50 ${className}`}
      aria-label="Open Repeat Vehicle Analysis in Analytics"
    >
      {panel}
    </Link>
  );
}



const REPEAT_SCALE_PADDING = 5;
const REPEAT_LABEL_ROW_H = 'h-6';

function getRepeatScaleMax(unique: number, repeat: number): number {
  return Math.max(unique, repeat, 0) + REPEAT_SCALE_PADDING;
}

function getRepeatYAxisTicks(scaleMax: number): number[] {
  const mid = Math.round(scaleMax / 2);
  if (mid <= 0 || mid === scaleMax) return [scaleMax, 0];
  return [scaleMax, mid, 0];
}

function RepeatBarChart({
  unique,
  repeat,
  mostActiveValue,
}: {
  unique: number;
  repeat: number;
  mostActiveValue: string;
}) {
  const scaleMax = getRepeatScaleMax(unique, repeat);
  const yTicks = getRepeatYAxisTicks(scaleMax);

  return (
    <div className="flex min-h-[10rem] flex-1 items-center px-1 pb-2 pt-0">
      <div className="relative flex w-full items-end">
        <span
          className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 border-t border-[#00d4ff]/50"
          aria-hidden
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <RepeatYAxisScale ticks={yTicks} />

            <div className="ml-10 flex items-start gap-4 sm:ml-14 sm:gap-6">
              <AnalyticsBarColumn
                key={`unique-${unique}-${scaleMax}`}
                value={unique}
                max={scaleMax}
                tone="cyan"
                delay={0}
              />
              <div className="ml-8 sm:ml-12">
                <AnalyticsBarColumn
                  key={`repeat-${repeat}-${scaleMax}`}
                  value={repeat}
                  max={scaleMax}
                  tone="magenta"
                  delay={200}
                />
              </div>
            </div>
          </div>

          <div className="mt-0 flex items-start gap-2">
            <div className={`w-8 shrink-0 ${REPEAT_LABEL_ROW_H}`} aria-hidden />
            <div className="ml-10 flex gap-4 sm:ml-14 sm:gap-6">
              <AnalyticsBarLabel label="Unique" tone="cyan" />
              <div className="ml-8 flex sm:ml-12">
                <AnalyticsBarLabel label="Repeat" tone="magenta" />
              </div>
            </div>
          </div>
        </div>

        <div className="ml-auto mr-14 min-w-[11rem] shrink-0 sm:mr-20">
          <MostActivePlateColumn key={`active-${mostActiveValue}`} plate={mostActiveValue} />
        </div>
      </div>
    </div>
  );
}

function RepeatYAxisScale({ ticks }: { ticks: number[] }) {
  return (
    <div className="flex h-44 w-8 shrink-0 flex-col justify-between pb-4 pt-1 sm:h-48">
      {ticks.map((tick) => (
        <span
          key={tick}
          className="block text-right font-orbitron text-[9px] leading-none text-[#00d4ff]/45"
        >
          {tick}
        </span>
      ))}
    </div>
  );
}

function AnalyticsBarLabel({ label, tone }: { label: string; tone: 'cyan' | 'magenta' }) {
  const isCyan = tone === 'cyan';
  const labelColor = isCyan ? '#00d4ff' : '#ff006e';

  return (
    <div className={`flex ${REPEAT_LABEL_ROW_H} w-[4.75rem] items-start justify-center sm:w-[5.25rem]`}>
      <p
        className="mt-3 w-full truncate text-center text-xs font-bold uppercase tracking-[0.14em]"
        style={{
          color: labelColor,
          textShadow: `0 0 8px ${isCyan ? 'rgba(0, 212, 255, 0.55)' : 'rgba(255, 0, 110, 0.55)'}`,
        }}
      >
        {label}
      </p>
    </div>
  );
}



function MostActivePlateColumn({ plate }: { plate: string }) {
  return (
    <div className="flex min-w-[11rem] shrink-0 flex-col items-center gap-2">
      <div className="h-[1.25rem] w-full shrink-0 sm:h-[1.5rem]" aria-hidden />

      <div className="flex h-56 w-full min-w-[11rem] max-w-[12rem] flex-col items-center justify-center gap-2">
        <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border border-[#00d4ff] bg-[rgba(0,212,255,0.1)] px-4 sm:h-[4.25rem]">
          <p
            className="w-full truncate text-center font-orbitron text-base font-bold leading-none tracking-wide text-[#00d4ff] sm:text-lg"
            style={{ textShadow: '0 0 8px rgba(0, 212, 255, 0.55)' }}
          >
            {plate}
          </p>
        </div>

        <p className="w-full truncate text-center text-xs font-bold uppercase tracking-[0.14em] text-[#00d4ff]">
          Most Active
        </p>
      </div>

      <p
        className="invisible w-full truncate text-center text-xs font-bold uppercase tracking-[0.14em]"
        aria-hidden
      >
        Most Active
      </p>
    </div>
  );
}

function AnalyticsBarColumn({
  value,
  max,
  tone,
  delay = 0,
}: {
  value: number;
  max: number;
  tone: 'cyan' | 'magenta';
  delay?: number;
}) {
  const isCyan = tone === 'cyan';
  const barColor = isCyan ? '#00e5ff' : '#ff006e';
  const heightPct = value > 0 ? (value / max) * 100 : 0;
  const valueShadow = isCyan ? '0 0 8px rgba(0, 229, 255, 0.55)' : '0 0 8px rgba(255, 0, 110, 0.55)';

  return (
    <div className="flex w-[4.75rem] shrink-0 flex-col items-center sm:w-[5.25rem]">
      <div
        className={`relative h-44 w-full overflow-hidden rounded-none border-[3px] border-b-0 bg-[rgba(0,0,0,0.15)] sm:h-48 ${
          isCyan
            ? 'repeat-analytics-bar-shell-cyan border-[#00e5ff]'
            : 'repeat-analytics-bar-shell-magenta border-[#ff006e]'
        }`}
      >
        {value > 0 && (
          <div
            className={isCyan ? 'repeat-analytics-bar-fill-cyan' : 'repeat-analytics-bar-fill-magenta'}
            style={{
              ['--fill-height' as string]: `${heightPct}%`,
              ['--bar-rise-delay' as string]: `${delay}ms`,
            }}
          />
        )}
        {value > 0 && (
          <span
            className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center font-orbitron text-base font-bold leading-none sm:text-lg"
            style={{ color: barColor, textShadow: valueShadow }}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}



function Metric({
  label,
  value,
  compact = false,
  tall = false,
  narrow = false,
}: {
  label: string;
  value: string | number;
  compact?: boolean;
  tall?: boolean;
  narrow?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center self-end overflow-hidden rounded-xl border border-white/45 bg-black/20 ${
        narrow ? 'px-1.5' : 'px-2 sm:px-3'
      } ${
        tall
          ? compact
            ? `${narrow ? 'min-h-[7rem] max-h-[9rem]' : 'min-h-[7.5rem] max-h-[9.5rem]'} w-full py-3`
            : `h-full ${narrow ? 'min-h-[4.5rem] py-2' : 'min-h-[5.25rem] py-2.5'}`
          : 'min-h-[64px] py-2'
      }`}
    >
      <p
        className={`w-full truncate uppercase tracking-[0.14em] text-slate-500 ${
          narrow ? 'text-[9px]' : 'text-[10px]'
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-2 w-full truncate font-orbitron font-bold leading-none text-cyber-cyan ${
          compact ? (narrow ? 'text-sm' : 'text-base sm:text-lg') : 'text-xl sm:text-2xl'
        }`}
        style={{ textShadow: '0 0 6px rgba(0, 247, 255, 0.55)' }}
      >
        {value}
      </p>
    </div>
  );

}


