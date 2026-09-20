export function Card({
  title,
  subtitle,
  action,
  className = "",
  children,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-white shadow-soft ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            {title && <h3 className="font-display text-sm font-semibold text-navy">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </div>
  );
}
