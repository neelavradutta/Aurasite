import { PANEL_ICON_CLASS } from '@/components/NavIcons';
import { useActiveTheme } from '@/hooks/useTheme';

const DARK_LOGO_SRC = '/peak-traffic-hours-logo-cropped.png';
const CREAM_LOGO_SRC = '/peak-traffic-hours-logo-white.png';

interface Props {
  className?: string;
}

/** Panel icon — cropped Peak Traffic Hours brand mark from /public. */
export default function PeakTrafficHoursLogo({ className = PANEL_ICON_CLASS }: Props) {
  const theme = useActiveTheme();
  const isCream = theme === 'brown-cream';

  return (
    <span className={`flex h-full w-full items-center justify-center ${className}`.trim()}>
      <img
        src={isCream ? CREAM_LOGO_SRC : DARK_LOGO_SRC}
        alt=""
        aria-hidden
        className={`peak-traffic-hours-logo ${isCream ? 'peak-traffic-hours-logo--cream' : ''} h-6 w-6`.trim()}
        draggable={false}
      />
    </span>
  );
}
