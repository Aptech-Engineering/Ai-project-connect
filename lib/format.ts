// Formatting helpers per spec section 5 (Global controls) and 9.4 (format field).

export function formatNumber(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  if (compact) {
    return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat("en-NG").format(value);
}

export function formatCurrency(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  if (compact && Math.abs(value) >= 100000) {
    return "₦" + new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  }
  return "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return (value * 100).toFixed(1) + "%";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatByKind(
  value: number | null | undefined,
  format: "number" | "currency" | "percent" | "duration",
  compact = false
): string {
  switch (format) {
    case "currency":
      return formatCurrency(value, compact);
    case "percent":
      return formatPercent(value);
    case "duration":
      return formatDuration(value);
    default:
      return formatNumber(value, compact);
  }
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
