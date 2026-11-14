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

/** Primeiro ano de PTRs eletrônicos no eFD (STOCK Act). */
export const EFD_START_YEAR = 2012;

export function backfillStart(_now = new Date()): Date {
  return new Date(EFD_START_YEAR, 0, 1);
}

export function backfillWindows(now = new Date()): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const endYear = now.getFullYear();
  for (let year = EFD_START_YEAR; year <= endYear; year += 1) {
    const start = new Date(year, 0, 1);
    const end = year === endYear ? now : new Date(year, 11, 31);
    windows.push({ start, end });
  }
  return windows;
}

export function incrementalStart(lastSuccess: Date | null, now = new Date()): Date {
  const start = lastSuccess ? new Date(lastSuccess) : backfillStart(now);
  start.setDate(start.getDate() - 7);
  return start;
}
