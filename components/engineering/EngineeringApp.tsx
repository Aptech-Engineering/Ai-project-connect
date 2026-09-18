"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import StaffLogin from "./StaffLogin";
import Dashboard from "./Dashboard";
import Toaster, { type Toast } from "../Toaster";
import type { Notify } from "../PortalApp";
import { onSessionExpired } from "@/lib/api";
import { StaffContext, signOut, useStaffSession, type StaffUser } from "@/lib/staff";

export default function EngineeringApp() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const { user, loading, refresh } = useStaffSession();

  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    setResetToken(new URLSearchParams(window.location.search).get("reset"));
  }, []);

  // The server ended the session (signed out elsewhere, disabled, or expired).
  useEffect(
    () =>
      onSessionExpired((kind) => {
        // Only meaningful while someone is actually signed in.
        if (kind !== "staff" || !user) return;
        void refresh();
      }),
    [refresh, user],
  );

  return (
    <>
      <AnimatePresence mode="wait">
        {loading && !user ? (
          <motion.div key="boot" exit={{ opacity: 0 }} className="grid min-h-screen place-items-center bg-navy">
            <Loader2 className="size-8 animate-spin text-brand" />
          </motion.div>
        ) : user ? (
          <motion.div key={`app-${user.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StaffContext.Provider value={user}>
              <Dashboard
                onSignOut={async () => {
                  await signOut();
                  await refresh();
                  notify("You've been signed out.", "info");
                }}
                notify={notify}
              />
            </StaffContext.Provider>
          </motion.div>
        ) : (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <StaffLogin
              resetToken={resetToken}
              onResetDone={() => {
                setResetToken(null);
                window.history.replaceState(null, "", "/engineering");
              }}
              onSuccess={async (u: StaffUser) => {
                await refresh();
                notify(`Welcome back, ${u.name.split(" ")[0]}.`);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}
