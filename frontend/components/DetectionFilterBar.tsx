import { useEffect, useRef, useState } from 'react';
import {
  countActiveDetectionFilters,
  DEFAULT_DETECTION_FILTERS,
  DEFAULT_DETECTION_SORT,
  DetectionListFilters,
  DetectionRegDateFilter,
  DetectionSortOption,
  DetectionVehicleFilter,
} from '@/utils/detectionFilters';

interface Props {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sort: DetectionSortOption;
  filters: DetectionListFilters;
  onSortChange: (sort: DetectionSortOption) => void;
  onFiltersChange: (filters: DetectionListFilters) => void;
}

const SORT_OPTIONS: Array<{ value: DetectionSortOption; label: string }> = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'violations-desc', label: 'Most violations' },
  { value: 'violations-asc', label: 'Least violations' },
  { value: 'plate', label: 'Plate A-Z' },
];

const VEHICLE_OPTIONS: Array<{ value: DetectionVehicleFilter; label: string }> = [
  { value: 'all', label: 'All vehicles' },
  { value: 'car', label: 'Cars' },
  { value: 'truck', label: 'Trucks' },
  { value: 'bike', label: 'Bikes' },
  { value: 'ev', label: "EV's" },
  { value: 'unknown', label: 'Unknown' },
];

const REGDATE_OPTIONS: Array<{ value: DetectionRegDateFilter; label: string }> = [
  { value: 'all', label: 'All dates' },
  { value: '2025', label: 'Registered 2025' },
  { value: '2024', label: 'Registered 2024' },
  { value: '2020-2023', label: 'Registered 2023-2020' },
  { value: 'pre-2020', label: 'Registered before 2020' },
];

type FilterSection = 'sort' | 'vehicle' | 'regdate';

function menuItemClass(active: boolean, section: FilterSection): string {
  const base = 'block w-full rounded-md px-2 py-2 text-left text-sm transition';

  if (active) {
    if (section === 'sort') {
      return `${base} bg-[#332c56] font-medium text-[#a896ff]`;
    }
    if (section === 'vehicle') {
      return `${base} bg-[#143444] font-medium text-[#00bcd4]`;
    }
    return `${base} bg-[#1a3d32] font-medium text-[#2ecc71]`;
  }

  if (section === 'sort') {
    return `${base} text-slate-300 hover:bg-[#332c56]/50 hover:text-[#a896ff]`;
  }
  if (section === 'vehicle') {
    return `${base} text-slate-300 hover:bg-[#143444]/70 hover:text-[#00bcd4]`;
  }
  return `${base} text-slate-300 hover:bg-[#1a3d32]/70 hover:text-[#2ecc71]`;
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M4 6h16M4 12h16M4 18h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function DetectionFilterBar({
  searchQuery,
  onSearchQueryChange,
  sort,
  filters,
  onSortChange,
  onFiltersChange,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeFilterCount = countActiveDetectionFilters(filters);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (wrapperRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  function handleClearAll() {
    onSortChange(DEFAULT_DETECTION_SORT);
    onFiltersChange(DEFAULT_DETECTION_FILTERS);
  }

  function handleDone() {
    setMenuOpen(false);
  }

  return (
    <div className="detection-filter-bar ml-14 flex w-[54rem] max-w-full items-center gap-3">
      <input
        type="text"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="Filter..."
        data-detection-log-action
        className="min-w-0 flex-1 rounded-md border border-cyber-cyan/30 bg-black/30 px-3 py-2 text-center text-sm outline-none focus:border-cyber-cyan"
      />

      <div className="relative shrink-0" ref={wrapperRef}>
        <button
          type="button"
          className="relative inline-flex h-9 min-w-[6rem] items-center justify-center gap-2 rounded-md border border-cyber-cyan/40 bg-black/30 px-5 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/10"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <FilterIcon />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyber-pink text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
          <span className={`text-xs text-slate-400 transition ${menuOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-max min-w-[42rem] max-w-[min(48rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-cyber-cyan/30 bg-[#0b1020] shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-stretch">
              <div className="min-w-[13.5rem] flex-1 p-3">
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Sort by
                </p>
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={menuItemClass(sort === option.value, 'sort')}
                    onClick={() => onSortChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="w-px shrink-0 bg-white/10" />

              <div className="min-w-[13.5rem] flex-1 p-3">
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Vehicle type
                </p>
                {VEHICLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={menuItemClass(filters.vehicle === option.value, 'vehicle')}
                    onClick={() => onFiltersChange({ ...filters, vehicle: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="w-px shrink-0 bg-white/10" />

              <div className="min-w-[13.5rem] flex-1 p-3">
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Registration date
                </p>
                {REGDATE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={menuItemClass(filters.regdate === option.value, 'regdate')}
                    onClick={() => onFiltersChange({ ...filters, regdate: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 p-2">
              <div className="overflow-hidden rounded-md border-2 border-cyber-cyan/50 shadow-[0_0_12px_rgba(0,188,212,0.2)]">
                <div className="flex">
                  <button
                    type="button"
                    className="flex-1 border-r border-cyber-cyan/30 px-3 py-2.5 text-xs font-medium text-cyber-pink transition hover:bg-cyber-pink/10 disabled:cursor-default disabled:opacity-40"
                    onClick={handleClearAll}
                    disabled={activeFilterCount === 0 && sort === DEFAULT_DETECTION_SORT}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-3 py-2.5 text-xs font-medium text-cyber-cyan transition hover:bg-cyber-cyan/10"
                    onClick={handleDone}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
