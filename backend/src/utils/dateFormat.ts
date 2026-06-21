function toDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date only: dd/mm/yyyy */
export function formatDate(value: unknown, fallback = ''): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Date and time: dd/mm/yyyy, hh:mm:ss */
export function formatDateTime(value: unknown, fallback = ''): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${formatDate(date)}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** Date and time without seconds: dd/mm/yyyy, hh:mm */
export function formatDateTimeShort(value: unknown, fallback = ''): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${formatDate(date)}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
