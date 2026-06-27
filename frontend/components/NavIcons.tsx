interface IconProps {
  className?: string;
}

/** Panel header icons (h-8 box) — not used for KPI cards or nav tabs. */
export const PANEL_ICON_CLASS = 'h-6 w-6 shrink-0';

export function DashboardNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function DetectionsNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
    </svg>
  );
}

function VehicleFrontCarGraphic({ strokeWidth = 1.5 }: { strokeWidth?: number }) {
  return (
    <g
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M8.75 6.75h6.5l-1.15 2.75H9.9L8.75 6.75z" />
      <path d="M5.5 10.15h1.75" />
      <path d="M16.75 10.15h1.75" />
      <path d="M4.85 14.35V12.05L6.45 11.05h1.85l-.25 3.3H4.85z" />
      <path d="M19.15 14.35V12.05L17.55 11.05h-1.85l.25 3.3h3.55z" />
      <path d="M10.35 12.75h3.3" />
      <rect x="10.55" y="15.55" width="2.9" height="1.65" rx="0.3" />
      <rect x="5.45" y="18.15" width="2.75" height="1.75" rx="0.7" />
      <rect x="15.8" y="18.15" width="2.75" height="1.75" rx="0.7" />
    </g>
  );
}

export function VehiclesNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <g transform="translate(12 12) scale(0.9) translate(-12 -12)">
        <VehicleFrontCarGraphic strokeWidth={1.35} />
      </g>
    </svg>
  );
}

export function VehiclesPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <g transform="translate(12 12) scale(0.9) translate(-12 -12)">
        <VehicleFrontCarGraphic strokeWidth={1.5} />
      </g>
    </svg>
  );
}

export function AnalyticsNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16V9M12 16V5M17 16v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LIVE_FEED_ACCENT = '#ef4444';

export function LiveFeedPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="1.75" y="9" width="13.5" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M15.25 9v6l3.75-3-3.75-3z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="4.5" cy="12" r="1.1" fill={LIVE_FEED_ACCENT} />
      <text
        x="6.45"
        y="12.05"
        fill="currentColor"
        fontSize="2.85"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        dominantBaseline="middle"
      >
        LIVE
      </text>
      <path
        d="M18.6 10.55A1.45 1.45 0 0 1 18.6 13.45"
        stroke={LIVE_FEED_ACCENT}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M18.6 8.95A2.55 2.55 0 0 1 18.6 14.05"
        stroke={LIVE_FEED_ACCENT}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M18.6 7.35A3.65 3.65 0 0 1 18.6 15.65"
        stroke={LIVE_FEED_ACCENT}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LiveNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClearNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoutNavIcon({ className = 'h-4 w-4 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const navItemIcons = {
  '/dashboard': DashboardNavIcon,
  '/detections': DetectionsNavIcon,
  '/vehicles': VehiclesNavIcon,
  '/analytics': AnalyticsNavIcon,
  '/live': LiveNavIcon,
} as const;

export function CameraKpiIcon({ className = 'h-5 w-5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export function UsersKpiIcon({ className = 'h-5 w-5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AvgConfidenceKpiIcon({ className = 'h-5 w-5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2A10 10 0 0 1 21.76 9.24" />
        <path d="M21.76 9.24A10 10 0 0 1 12 22" opacity="0.3" />
        <path d="M12 22A10 10 0 0 1 2.24 14.76" opacity="0.3" />
        <path d="M2.24 14.76A10 10 0 0 1 12 2" opacity="0.3" />
      </g>
      <path
        d="M12 6.35l4.35 0.9v3.45c0 0-1.5 3.75-4.35 4.95-2.85-1.2-4.35-4.95-4.35-4.95V7.25L12 6.35z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9.65 11.65l1.4 1.4 3.05-3.05"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="16.85"
        textAnchor="middle"
        fill="currentColor"
        fontSize="4.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        %
      </text>
    </svg>
  );
}

const SUSPICIOUS_SHIELD_PATH =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

export function SuspiciousVehiclesPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <defs>
        <clipPath id="apnr-suspicious-shield-right">
          <rect x="12" y="3" width="12" height="19" />
        </clipPath>
      </defs>
      <path
        d={SUSPICIOUS_SHIELD_PATH}
        fill="currentColor"
        clipPath="url(#apnr-suspicious-shield-right)"
      />
      <path
        d={SUSPICIOUS_SHIELD_PATH}
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const kpiCardIcons = {
  total_detections: CameraKpiIcon,
  unique_plates: UsersKpiIcon,
  avg_confidence: AvgConfidenceKpiIcon,
} as const;

export function VideoInputPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2" y="6" width="14" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LicensePlatePanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="7" width="18" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11h2M15 11h2M11 11h2" strokeLinecap="round" />
    </svg>
  );
}

export function OwnerDetailIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PaletteDetailIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
      <path
        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RupeeDetailIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path
        d="M8 8h8M8 12h6a2 2 0 1 0 0-4H8M8 12h8M8 16h8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SpeedometerPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="4 8 16 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6.5 15a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <circle cx="7.2" cy="15" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="8.6" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.2" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
      <path d="M12 15.2 15.1 11.1" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="15.2" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RepeatAnalysisPanelIcon({ className = PANEL_ICON_CLASS }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarDetailIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExportHeaderIcon({ className = 'h-3.5 w-3.5 shrink-0' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M8 4h7l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        strokeLinejoin="round"
      />
      <path d="M15 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11.5h5" strokeLinecap="round" />
      <path d="M9 15.5l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 21H17v-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
