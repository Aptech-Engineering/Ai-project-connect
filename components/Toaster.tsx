"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X } from "lucide-react";

export interface Toast {
  id: string;
  message: string;
  tone: "success" | "info";
}

export default function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-navy/95 px-4 py-3 text-sm text-white shadow-2xl shadow-navy/30 backdrop-blur"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-brand" />
            )}
            <p className="flex-1 leading-relaxed">{t.message}</p>
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="rounded-md p-0.5 text-white/50 hover:text-white">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
