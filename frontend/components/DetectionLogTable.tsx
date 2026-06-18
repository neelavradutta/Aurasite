import { useState } from 'react';
import { Detection } from '@/types/detection';
import { useDashboardStore } from '@/store/dashboardStore';
import { DETECTION_LOG_COLUMNS } from '@/utils/detectionLogColumns';
import { isAcceptedDetection } from '@/utils/dashboardDetections';

interface Props {
  detections: Detection[];
  hideTitle?: boolean;
  visibleRowCount?: number;
}

const columns = DETECTION_LOG_COLUMNS;

const cellClass = 'px-3 py-3 text-center text-sm text-slate-300';
const headerClass =
  'px-3 py-4 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400';
const stickyHeaderClass = `${headerClass} sticky top-0 z-20 bg-[#0f173a] shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]`;

/** Default rows shown before the log body scrolls internally (dashboard). */
const DEFAULT_VISIBLE_ROW_COUNT = 10;
const HEADER_ROW_HEIGHT_PX = 56;
const BODY_ROW_HEIGHT_PX = 50;

function tableScrollHeight(visibleRowCount: number): number {
  return HEADER_ROW_HEIGHT_PX + visibleRowCount * BODY_ROW_HEIGHT_PX;
}

function cellClassFor(key: string): string {
  if (key === 'plate') return `${cellClass} font-orbitron font-semibold tracking-wide`;
  if (key === 'frame') return `${cellClass} font-mono`;
  if (key === 'vehicleType' || key === 'colour') return `${cellClass} capitalize`;
  if (key === 'address') return `${cellClass} max-w-[180px] truncate`;
  return cellClass;
}

export default function DetectionLogTable({
  detections,
  hideTitle = false,
  visibleRowCount = DEFAULT_VISIBLE_ROW_COUNT,
}: Props) {
  const { setSelectedPlate } = useDashboardStore();
  const [logSelectedId, setLogSelectedId] = useState<number | null>(null);
  const useInnerScroll = detections.length > visibleRowCount;
  const maxBodyHeight = tableScrollHeight(visibleRowCount);

  return (
    <div className="glass-panel overflow-hidden rounded-xl border border-white/5">
      {!hideTitle && (
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="font-orbitron text-sm uppercase tracking-wider text-cyber-cyan">Detection Log</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          className={
            useInnerScroll
              ? 'overflow-y-auto [scrollbar-color:rgba(0,247,255,0.45)_transparent] [scrollbar-width:thin]'
              : undefined
          }
          style={useInnerScroll ? { maxHeight: maxBodyHeight } : undefined}
        >
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={stickyHeaderClass}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detections.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center">
                    <p className="font-mono text-sm tracking-wide text-slate-400">No records loaded yet.</p>
                  </td>
                </tr>
              ) : (
                detections.map((detection) => {
                  const isSelected = logSelectedId === detection.id;

                  return (
                    <tr
                      key={detection.id}
                      onClick={() => {
                        setLogSelectedId(detection.id);
                        if (isAcceptedDetection(detection)) {
                          setSelectedPlate(detection);
                        }
                      }}
                      className={`cursor-pointer border-t border-white/5 transition ${
                        isSelected
                          ? 'bg-cyber-cyan/10 shadow-[inset_0_3px_0_0_rgba(0,255,255,0.8)]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cellClassFor(column.key)}
                          title={column.key === 'address' ? column.getValue(detection) : undefined}
                        >
                          {column.getValue(detection)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="h-1.5 bg-gradient-to-r from-transparent via-cyber-cyan/70 to-transparent" />
    </div>
  );
}
