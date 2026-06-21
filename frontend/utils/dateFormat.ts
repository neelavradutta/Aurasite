const DATE_LOCALE = 'en-GB';

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Date only: dd/mm/yyyy */
export function formatDate(value?: string | Date | null, fallback = '--'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Date and time: dd/mm/yyyy, hh:mm:ss */
export function formatDateTime(value?: string | Date | null, fallback = '--'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString(DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Date and time without seconds: dd/mm/yyyy, hh:mm */
export function formatDateTimeShort(value?: string | Date | null, fallback = '--'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString(DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
