"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IdeaWizard } from "./ApplyPage";

/**
 * The idea application in a dialog, for people who start it from the home page.
 *
 * It is only the chrome: the form, the draft saving and the commitment fee all live in
 * `IdeaWizard`, which the /apply page renders too. Closing the dialog throws nothing
 * away — every step is already saved on the server under the resume token.
 */
export default function SubmitIdeaModal({
  open,
  onClose,
  initialEmail,
  resumeToken,
}: {
  open: boolean;
  onClose: () => void;
  initialEmail?: string;
  resumeToken?: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const focus = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus(), 250);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focus);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="idea-title"
            initial={{ y: 60, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <IdeaWizard variant="modal" initialEmail={initialEmail} resumeToken={resumeToken} onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
