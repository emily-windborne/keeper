export function toISODate(d: Date): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Sunday = 0 … Saturday = 6 calendar cells for a month (padded to full weeks). */
export function getMonthGridCells(monthAnchor: Date): { date: Date; inMonth: boolean }[] {
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth();
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const out: { date: Date; inMonth: boolean }[] = [];

  for (let i = pad; i > 0; i--) {
    out.push({ date: new Date(y, m, 1 - i), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    out.push({ date: new Date(y, m, day), inMonth: true });
  }
  const tail = (7 - (out.length % 7)) % 7;
  const lastInMonth = new Date(y, m, daysInMonth);
  for (let i = 1; i <= tail; i++) {
    const next = new Date(lastInMonth);
    next.setDate(next.getDate() + i);
    out.push({ date: next, inMonth: false });
  }
  return out;
}

export function timeStartToHour(time: string | null): number | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time.trim())) return null;
  const [h] = time.split(":").map(Number);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}
