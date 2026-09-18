"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import StaffLogin from "./StaffLogin";
import Dashboard from "./Dashboard";
import Toaster, { type Toast } from "../Toaster";
import type { Notify } from "../PortalApp";
import { StaffContext, useStaffUsers, type StaffUser } from "@/lib/staff";

export interface StaffSession {
  userId: string;
  signedInAt: string;
}

const SESSION_KEY = "apc-staff-session-v2";

export default function EngineeringApp() {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const users = useStaffUsers();
  const user = session ? users.find((u) => u.id === session.userId) : undefined;

  const persist = useCallback((s: StaffSession | null) => {
    setSession(s);
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }, []);

  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    setResetToken(new URLSearchParams(window.location.search).get("reset"));
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      setSession(raw ? (JSON.parse(raw) as StaffSession) : null);
    } catch {
      setSession(null);
    }
  }, []);

  // Signed out if an admin disables or deletes the account.
  useEffect(() => {
    if (session && (!user || user.status !== "active")) {
      persist(null);
      notify("Your staff account is no longer active. Contact an admin.", "info");
    }
  }, [session, user, persist, notify]);

  return (
    <>
      <AnimatePresence mode="wait">
        {session === undefined ? (
          <motion.div key="boot" exit={{ opacity: 0 }} className="grid min-h-screen place-items-center bg-navy">
            <Loader2 className="size-8 animate-spin text-brand" />
          </motion.div>
        ) : session && user && user.status === "active" ? (
          <motion.div key={`app-${user.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StaffContext.Provider value={user}>
              <Dashboard
                onSignOut={() => {
                  persist(null);
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
              onSuccess={(u: StaffUser) => {
                persist({ userId: u.id, signedInAt: new Date().toISOString() });
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
