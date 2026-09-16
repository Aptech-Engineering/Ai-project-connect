const DAY = 86_400_000;

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("en-GB", opts);
}

export function shortDate(iso: string) {
  return formatDate(iso, { day: "2-digit", month: "short" });
}

export function daysFromNow(iso: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / DAY);
}

export function relativeDay(iso: string) {
  const d = daysFromNow(iso);
  if (d === 0) return "Today";
  if (d === -1) return "Yesterday";
  if (d === 1) return "Tomorrow";
  return d < 0 ? `${-d} days ago` : `In ${d} days`;
}

export function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
