import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Detection } from '@/types/detection';
import { useDashboardStore } from '@/store/dashboardStore';
import { DETECTION_LOG_COLUMNS } from '@/utils/detectionLogColumns';
import { isAcceptedDetection, normalizePlateKey } from '@/utils/dashboardDetections';

interface Props {
  detections: Detection[];
  hideTitle?: boolean;
  visibleRowCount?: number;
  highlightPlate?: string;
  highlightDetectionId?: number;
  selectedDetectionIds?: number[];
  exitingDetectionIds?: number[];
  onSelectionChange?: (detections: Detection[]) => void;
  onExitAnimationEnd?: (detectionId: number) => void;
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
  if (key === 'violations') return `${cellClass} font-mono text-cyber-pink`;
  if (key === 'vehicleType' || key === 'colour') return `${cellClass} capitalize`;
  if (key === 'address') return `${cellClass} max-w-[180px] truncate`;
  return cellClass;
}

export default function DetectionLogTable({
  detections,
  hideTitle = false,
  visibleRowCount = DEFAULT_VISIBLE_ROW_COUNT,
  highlightPlate,
  highlightDetectionId,
  selectedDetectionIds,
  onSelectionChange,
  exitingDetectionIds,
  onExitAnimationEnd,
}: Props) {
  const { setSelectedPlate } = useDashboardStore();
  const [internalSelectedIds, setInternalSelectedIds] = useState<number[]>([]);
  const isControlledSelection = selectedDetectionIds !== undefined;
  const activeSelectedIds = useMemo(
    () => new Set(isControlledSelection ? selectedDetectionIds ?? [] : internalSelectedIds),
    [isControlledSelection, selectedDetectionIds, internalSelectedIds]
  );
  const exitingIdSet = useMemo(() => new Set(exitingDetectionIds ?? []), [exitingDetectionIds]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tablePanelRef = useRef<HTMLDivElement>(null);
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const highlightScrollDoneRef = useRef(false);
  const useInnerScroll = detections.length > visibleRowCount;
  const maxBodyHeight = tableScrollHeight(visibleRowCount);
  const normalizedHighlightPlate = highlightPlate ? normalizePlateKey(highlightPlate) : '';

  const primaryHighlightId = useMemo(() => {
    if (highlightDetectionId && detections.some((detection) => detection.id === highlightDetectionId)) {
      return highlightDetectionId;
    }
    if (!normalizedHighlightPlate) return null;
    const match = detections.find(
      (detection) => normalizePlateKey(detection.plate_number) === normalizedHighlightPlate
    );
    return match?.id ?? null;
  }, [detections, highlightDetectionId, normalizedHighlightPlate]);

  const applySelection = useCallback(
    (nextDetections: Detection[], anchorIndex: number | null = null) => {
      if (!isControlledSelection) {
        setInternalSelectedIds(nextDetections.map((detection) => detection.id));
      }
      onSelectionChange?.(nextDetections);

      const lastDetection = nextDetections[nextDetections.length - 1];
      if (lastDetection && isAcceptedDetection(lastDetection)) {
        setSelectedPlate(lastDetection);
      } else if (nextDetections.length === 0) {
        setSelectedPlate(null);
      }

      if (anchorIndex != null) {
        selectionAnchorIndexRef.current = anchorIndex;
      }
    },
    [isControlledSelection, onSelectionChange, setSelectedPlate]
  );

  const clearSelection = useCallback(() => {
    applySelection([], null);
    selectionAnchorIndexRef.current = null;
  }, [applySelection]);

  useEffect(() => {
    if (activeSelectedIds.size === 0) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (tablePanelRef.current?.contains(target)) return;
      if (target.closest('[data-detection-log-action]')) return;
      clearSelection();
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [activeSelectedIds.size, clearSelection]);

  useEffect(() => {
    if (!primaryHighlightId) return;
    const detection = detections.find((item) => item.id === primaryHighlightId);
    const anchorIndex = detections.findIndex((item) => item.id === primaryHighlightId);
    applySelection(detection ? [detection] : [], anchorIndex >= 0 ? anchorIndex : null);
  }, [primaryHighlightId, detections, applySelection]);

  useEffect(() => {
    if (!normalizedHighlightPlate && !primaryHighlightId) return;
    if (highlightScrollDoneRef.current) return;
    if (detections.length === 0) return;

    const timer = window.setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      let target: HTMLElement | null = null;
      if (primaryHighlightId) {
        target = container.querySelector(
          `[data-detection-id="${primaryHighlightId}"]`
        ) as HTMLElement | null;
      }
      if (!target && normalizedHighlightPlate) {
        target = container.querySelector(
          `[data-plate-key="${normalizedHighlightPlate}"]`
        ) as HTMLElement | null;
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightScrollDoneRef.current = true;
      }
    }, 580);

    return () => window.clearTimeout(timer);
  }, [detections, normalizedHighlightPlate, primaryHighlightId]);

  function handleRowClick(detection: Detection, rowIndex: number, event: React.MouseEvent) {
    if (exitingIdSet.has(detection.id)) return;

    const isSelected = activeSelectedIds.has(detection.id);
    const selectedList = detections.filter((row) => activeSelectedIds.has(row.id));

    if (event.shiftKey && selectionAnchorIndexRef.current != null) {
      const anchorIndex = selectionAnchorIndexRef.current;
      const start = Math.min(anchorIndex, rowIndex);
      const end = Math.max(anchorIndex, rowIndex);
      applySelection(detections.slice(start, end + 1), rowIndex);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (isSelected) {
        applySelection(
          selectedList.filter((row) => row.id !== detection.id),
          rowIndex
        );
      } else {
        applySelection([...selectedList, detection], rowIndex);
      }
      return;
    }

    if (isSelected && activeSelectedIds.size === 1) {
      clearSelection();
      return;
    }

    applySelection([detection], rowIndex);
  }

  return (
    <div ref={tablePanelRef} className="glass-panel overflow-hidden rounded-xl border border-white/5">
      {!hideTitle && (
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="font-orbitron text-sm uppercase tracking-wider text-cyber-cyan">Detection Log</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          ref={scrollContainerRef}
          className={
            useInnerScroll
              ? 'overflow-y-auto overflow-x-hidden [scrollbar-color:rgba(0,247,255,0.45)_transparent] [scrollbar-width:thin]'
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
                detections.map((detection, rowIndex) => {
                  const isSelected = activeSelectedIds.has(detection.id);
                  const isExiting = exitingIdSet.has(detection.id);
                  const plateKey = normalizePlateKey(detection.plate_number);
                  const isPrimaryHighlight = primaryHighlightId === detection.id;
                  const isPlateHighlight =
                    Boolean(normalizedHighlightPlate) && plateKey === normalizedHighlightPlate;

                  return (
                    <tr
                      key={detection.id}
                      data-detection-id={detection.id}
                      data-plate-key={plateKey || undefined}
                      onAnimationEnd={(animationEvent) => {
                        if (animationEvent.animationName !== 'detection-log-row-exit') return;
                        if (!isExiting) return;
                        onExitAnimationEnd?.(detection.id);
                      }}
                      onClick={(clickEvent) => handleRowClick(detection, rowIndex, clickEvent)}
                      className={`border-t border-white/5 transition ${
                        isExiting
                          ? 'detection-log-row--exit pointer-events-none'
                          : 'cursor-pointer'
                      } ${
                        isExiting
                          ? ''
                          : isPrimaryHighlight
                            ? 'detection-log-row--highlight-primary'
                            : isPlateHighlight
                              ? 'detection-log-row--highlight'
                              : isSelected
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
