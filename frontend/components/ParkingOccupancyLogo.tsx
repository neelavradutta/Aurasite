const LOGO_SRC = '/parking-occupancy-logo-lines.png';

interface Props {
  className?: string;
}

export default function ParkingOccupancyLogo({ className = 'h-full w-full' }: Props) {
  return (
    <span className={`flex h-full w-full items-center justify-center ${className}`.trim()}>
      <img
        src={LOGO_SRC}
        alt=""
        aria-hidden
        draggable={false}
        className="block h-6 w-6 object-contain"
      />
    </span>
  );
}
