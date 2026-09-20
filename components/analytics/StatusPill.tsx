export function StatusPill({ status, label }: { status: "good" | "warning" | "serious" | "critical"; label: string }) {
  const map = {
    good: { bg: "#ddf2ee", text: "#006300", icon: "✓" },
    warning: { bg: "#fff4dd", text: "#7a5200", icon: "!" },
    serious: { bg: "#fdebdd", text: "#8a3413", icon: "!" },
    critical: { bg: "#fbe3e1", text: "#b42318", icon: "✕" },
  }[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: map.bg, color: map.text }}
    >
      <span aria-hidden>{map.icon}</span> {label}
    </span>
  );
}
