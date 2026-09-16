"use client";

import { motion } from "framer-motion";
import { Check, Pause } from "lucide-react";
import { TIMELINE, timelineStep } from "@/lib/data";
import { cn } from "@/lib/format";
import type { Project } from "@/lib/types";

export default function StageTimeline({ project }: { project: Project }) {
  const current = timelineStep(project);
  const delivered = project.stage === "DELIVERED";
  const onHold = project.stage === "ON_HOLD";
  const fill = delivered ? 100 : (current / (TIMELINE.length - 1)) * 100;

  return (
    <div className="mt-9 overflow-x-auto pb-1 no-scrollbar">
      <ol className="relative flex min-w-[520px] justify-between">
        <div className="absolute left-[calc(100%/12)] right-[calc(100%/12)] top-[17px] h-1 rounded-full bg-line">
          <motion.div
            className="h-full rounded-full bg-teal"
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ delay: 0.3, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {TIMELINE.map((label, i) => {
          const complete = delivered || i < current;
          const isCurrent = !delivered && i === current;
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.12 }}
              className="relative flex flex-1 flex-col items-center gap-2.5 text-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="relative grid size-9 place-items-center">
                {isCurrent && !onHold && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />}
                <span
                  className={cn(
                    "relative grid size-9 place-items-center rounded-full border-4 border-white shadow-md transition",
                    complete && "bg-teal text-white",
                    isCurrent && (onHold ? "bg-danger text-white" : "bg-brand text-white"),
                    !complete && !isCurrent && "bg-line text-muted",
                  )}
                >
                  {complete ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : isCurrent && onHold ? (
                    <Pause className="size-3.5" fill="currentColor" />
                  ) : isCurrent ? (
                    <span className="size-2 rounded-full bg-white" />
                  ) : (
                    <span className="text-[11px] font-bold">{i + 1}</span>
                  )}
                </span>
              </span>
              <span className={cn("text-sm", complete || isCurrent ? "font-bold text-navy" : "text-muted")}>{label}</span>
              <span
                className={cn(
                  "-mt-2 text-[11px]",
                  complete ? "text-teal-700" : isCurrent ? (onHold ? "text-danger" : "text-brand-700") : "text-transparent",
                )}
              >
                {complete ? "Done" : isCurrent ? (onHold ? "Paused" : "In progress") : "·"}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
