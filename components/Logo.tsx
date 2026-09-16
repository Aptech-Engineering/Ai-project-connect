import { cn } from "@/lib/format";

export default function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-[10px] bg-brand font-display text-[15px] font-bold text-white shadow-lg shadow-brand/30">
        AI
      </span>
      <span className={cn("font-display text-[17px] font-semibold tracking-tight", dark ? "text-navy" : "text-white")}>
        AI Project Connect
      </span>
    </span>
  );
}
