"use client";

export function DefinitionsDrawer({
  open,
  onClose,
  definitions,
}: {
  open: boolean;
  onClose: () => void;
  definitions: Record<string, string>;
}) {
  if (!open) return null;
  const entries = Object.entries(definitions);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} aria-hidden />
      <div className="relative h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-navy">Definitions</h2>
          <button onClick={onClose} className="focus-ring rounded-lg px-2 py-1 text-muted hover:bg-mist" aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="mt-4 space-y-4">
          {entries.length === 0 && <p className="text-sm text-muted">No metric-specific notes for this screen.</p>}
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt className="text-sm font-medium text-navy">{key}</dt>
              <dd className="mt-0.5 text-sm text-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
