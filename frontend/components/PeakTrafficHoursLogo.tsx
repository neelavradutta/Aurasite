import { PANEL_ICON_CLASS } from '@/components/NavIcons';

const LOGO_SRC = '/peak-traffic-hours-logo-cropped.png';

interface Props {
  className?: string;
}

/** Panel icon — cropped Peak Traffic Hours brand mark from /public. */
export default function PeakTrafficHoursLogo({ className = PANEL_ICON_CLASS }: Props) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      aria-hidden
      className={`peak-traffic-hours-logo ${className}`.trim()}
      draggable={false}
    />
  );
}
