export function toIsoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

export function formatMdy(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

export function backfillStart(now = new Date()): Date {
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 3);
  return start;
}

export function incrementalStart(lastSuccess: Date | null, now = new Date()): Date {
  const start = lastSuccess ? new Date(lastSuccess) : backfillStart(now);
  start.setDate(start.getDate() - 7);
  return start;
}
