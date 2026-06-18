export function formatHourSlot(hour: number): string {
  const endHour = (hour + 1) % 24;
  const formatPart = (value: number) => {
    const period = value >= 12 && value < 24 ? 'PM' : 'AM';
    const display = value % 12 || 12;
    return `${display}${period}`;
  };

  return `${formatPart(hour)} - ${formatPart(endHour)}`;
}