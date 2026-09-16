"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import StaffLogin from "./StaffLogin";
import Dashboard from "./Dashboard";
import Toaster, { type Toast } from "../Toaster";
import type { Notify } from "../PortalApp";
import type { StaffRole } from "./helpers";

export interface StaffSession {
  login: string;
  role: StaffRole;
  signedInAt: string;
}

const SESSION_KEY = "apc-staff-session";

export default function EngineeringApp() {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      setSession(raw ? (JSON.parse(raw) as StaffSession) : null);
    } catch {
      setSession(null);
    }
  }, []);

  const persist = (s: StaffSession | null) => {
    setSession(s);
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  };

  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <>
      <AnimatePresence mode="wait">
        {session === undefined ? (
          <motion.div key="boot" exit={{ opacity: 0 }} className="grid min-h-screen place-items-center bg-navy">
            <Loader2 className="size-8 animate-spin text-brand" />
          </motion.div>
        ) : session ? (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard
              session={session}
              onRoleChange={(role) => persist({ ...session, role })}
              onSignOut={() => {
                persist(null);
                notify("You've been signed out.", "info");
              }}
              notify={notify}
            />
          </motion.div>
        ) : (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <StaffLogin
              onSuccess={(login) => {
                persist({ login, role: "lead", signedInAt: new Date().toISOString() });
                notify("Welcome to the Engineering Panel.");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}
