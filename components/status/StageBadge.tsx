import { STAGES } from "@/lib/data";
import { cn } from "@/lib/format";
import type { StageKey, Tone } from "@/lib/types";

const TONES: Record<Tone, string> = {
  grey: "bg-line text-muted",
  blue: "bg-blue-soft text-navy",
  "orange-soft": "bg-brand-soft text-brand-700",
  orange: "bg-brand text-white",
  "teal-soft": "bg-teal-soft text-teal-700",
  teal: "bg-teal text-white",
  red: "bg-danger-soft text-danger",
};

export default function StageBadge({ stage, large }: { stage: StageKey; large?: boolean }) {
  const s = STAGES[stage];
  const live = stage !== "DELIVERED" && stage !== "ON_HOLD";
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-2 rounded-full font-display font-bold uppercase tracking-wide",
        large ? "px-4 py-2 text-xs" : "px-2.5 py-1 text-[10px]",
        TONES[s.tone],
      )}
    >
      {live && (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      )}
      {s.label}
    </span>
  );
}
