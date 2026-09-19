export function listDays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function previousRange(from: string, to: string) {
  const span = daysBetween(from, to);
  return { from: addDays(from, -span), to: addDays(from, -1) };
}

export function yearAgoRange(from: string, to: string) {
  const shift = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  };
  return { from: shift(from), to: shift(to) };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
