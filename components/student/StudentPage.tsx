"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, Loader2, LogIn, LogOut, QrCode, RefreshCw, Share, Timer, WifiOff, X, XCircle } from "lucide-react";
import { errorMessage, ApiError } from "@/lib/api";
import { attendanceSignOut, studentSignIn, studentStatus, type StudentProfile } from "@/lib/students";
import { ScanToSignIn } from "./ScanToSignIn";
import { cn } from "@/lib/format";
import AptechMark from "../AptechMark";

/** The phone remembers who it belongs to, and the last answer it was given. */
const STORE = "apc.student.v1";

interface Saved {
  studentId: string;
  token: string;
  profile: StudentProfile;
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(profile: StudentProfile) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ studentId: profile.studentId, token: profile.token, profile } satisfies Saved));
  } catch {
    /* A phone with storage switched off still works — it just asks for the name again. */
  }
}

export function StudentPage() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (studentId: string, token: string) => {
    setBusy(true);
    try {
      const fresh = await studentStatus(studentId, token);
      setProfile(fresh);
      save(fresh);
      setOffline(false);
      setError("");
      return fresh;
    } catch (e) {
      // A dead token means the record was removed or reissued: ask for the name again.
      if (e instanceof ApiError && e.status === 404) {
        localStorage.removeItem(STORE);
        setSaved(null);
        setProfile(null);
        setError("Your saved sign-in has expired. Enter your details again.");
      } else {
        // Anything else at the gate is almost always the network. Keep showing what we have.
        setOffline(true);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // Saved to the phone, the pass opens even on a bad line at the gate.
  useEffect(() => {
    // isSecureContext covers https and localhost, which is where a worker is allowed.
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/student-sw.js", { scope: "/student/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const stored = load();
    if (stored) {
      setSaved(stored);
      setProfile(stored.profile);
      void refresh(stored.studentId, stored.token);
    }
    setReady(true);
  }, [refresh]);

  // Coming back to the page — out of a pocket, at the gate — must show today's answer.
  useEffect(() => {
    if (!saved) return;
    const again = () => {
      if (document.visibilityState === "visible") void refresh(saved.studentId, saved.token);
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
  }, [saved, refresh]);

  const signOut = () => {
    localStorage.removeItem(STORE);
    setSaved(null);
    setProfile(null);
    setError("");
  };

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy-950">
        <Loader2 className="size-8 animate-spin text-brand" />
        <span className="sr-only">Loading…</span>
      </main>
    );
  }

  if (!profile) {
    return (
      <SignIn
        error={error}
        onDone={(p) => {
          setProfile(p);
          setSaved({ studentId: p.studentId, token: p.token, profile: p });
          save(p);
        }}
      />
    );
  }

  return (
    <GateCard
      profile={profile}
      busy={busy}
      offline={offline}
      onRefresh={() => saved && void refresh(saved.studentId, saved.token)}
      onSignOut={signOut}
      onProfile={(fresh) => {
        setProfile(fresh);
        setSaved({ studentId: fresh.studentId, token: fresh.token, profile: fresh });
        save(fresh);
      }}
    />
  );
}

/* ---------------- signing in ---------------- */

function SignIn({ error, onDone }: { error: string; onDone: (p: StudentProfile) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", studentId: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // Two students share this name: one more detail settles it.
  const [namesake, setNamesake] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.firstName.trim().length > 1 && form.lastName.trim().length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setProblem("");
    try {
      onDone(
        await studentSignIn({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          studentId: form.studentId.trim() || undefined,
          phone: form.phone.trim() || undefined,
        }),
      );
    } catch (err) {
      // The server says which extra detail it wants; show the field for it.
      if (err instanceof ApiError && err.errors.studentId) {
        setNamesake(true);
        setProblem(`${err.message} ${err.errors.studentId}`);
      } else {
        setProblem(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const field =
    "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white outline-none placeholder:text-white/35 focus:border-brand";
  const labelClass = "block text-xs font-bold uppercase tracking-wider text-white/55";

  return (
    <main className="min-h-screen bg-navy-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-brand font-display text-sm font-bold">AI</span>
          <span className="font-display text-base font-semibold leading-tight">
            AI Project Connect
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/45">Student pass</span>
          </span>
          <AptechMark height="h-6" className="ml-auto" />
        </div>

        <h1 className="mt-8 font-display text-3xl font-extrabold leading-tight">Your student pass</h1>
        <p className="mt-2 text-sm text-white/65">
          Your name is enough. Sign in once and your phone remembers you, so at the gate you just open this page and show it.
        </p>

        {(problem || error) && (
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-red-500/15 p-3 text-sm text-red-200 ring-1 ring-red-500/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {problem || error}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className={labelClass}>
            First name
            <input
              id="student-first"
              value={form.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              placeholder="Emmanuel"
              autoComplete="given-name"
              className={cn(field, "mt-1.5")}
            />
          </label>
          <label className={labelClass}>
            Last name
            <input
              id="student-last"
              value={form.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              placeholder="Adewunmi"
              autoComplete="family-name"
              className={cn(field, "mt-1.5")}
            />
          </label>

          <label className={labelClass}>
            Student ID <span className="font-sans normal-case tracking-normal text-white/35">— only if you know it</span>
            <input
              id="student-id"
              value={form.studentId}
              onChange={(e) => set({ studentId: e.target.value })}
              placeholder="APC/26/0001"
              autoCapitalize="characters"
              className={cn(field, "mt-1.5 font-mono")}
            />
          </label>

          {namesake && (
            <label className={labelClass}>
              Phone number on your record
              <input
                id="student-phone"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="0803 000 0000"
                inputMode="tel"
                autoComplete="tel"
                className={cn(field, "mt-1.5")}
              />
              <span className="mt-1 block font-sans text-[11px] font-normal normal-case tracking-normal text-white/45">
                Either this or your Student ID will do.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={!valid || busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Checking…" : "Open my pass"}
          </button>
        </form>

        <p className="mt-6 text-xs text-white/45">
          Not finding yourself? Ask at the front desk — your name may be spelled differently on the register.
        </p>
        <Link href="/" className="mt-6 inline-block text-xs font-semibold text-white/50 underline-offset-4 hover:text-white hover:underline">
          ← aiprojectconnect.com.ng
        </Link>
      </div>
    </main>
  );
}

/* ---------------- the pass itself ---------------- */

/** Beyond this, the answer on screen is too old to be trusted at a gate. */
const STALE_AFTER_MS = 10 * 60 * 1000;

function GateCard({
  profile,
  busy,
  offline,
  onRefresh,
  onSignOut,
  onProfile,
}: {
  profile: StudentProfile;
  busy: boolean;
  offline: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  onProfile: (p: StudentProfile) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const install = useInstall();
  const { installed } = install;
  const [sheet, setSheet] = useState(false);
  // A few seconds in: the student has read their status, and has not left.
  useEffect(() => {
    if (installed || install.state === "none") return;
    let putOff = 0;
    try {
      putOff = Number(localStorage.getItem(DISMISSED) ?? 0);
    } catch {
      /* no storage, so ask */
    }
    if (Date.now() - putOff < NAG_AFTER_DAYS * 86400000) return;
    const t = window.setTimeout(() => setSheet(true), 3500);
    return () => window.clearTimeout(t);
  }, [installed, install.state]);

  const { verdict } = profile;
  const checkedAt = new Date(profile.checkedAt).getTime();
  const age = Math.max(0, now - checkedAt);
  const stale = age > STALE_AFTER_MS;

  const tone = {
    green: { card: "bg-emerald-600", text: "text-white", chip: "bg-white/20", Icon: CheckCircle2 },
    amber: { card: "bg-amber-400", text: "text-amber-950", chip: "bg-black/10", Icon: AlertTriangle },
    red: { card: "bg-red-600", text: "text-white", chip: "bg-white/20", Icon: XCircle },
  }[verdict.tone];

  return (
    <main className="min-h-screen bg-navy-950 pb-10 text-white">
      <div className="mx-auto w-full max-w-md px-4 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[9px] bg-brand font-display text-xs font-bold">AI</span>
          <span className="text-sm font-bold leading-tight">
            Student pass
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/45">AI Project Connect</span>
          </span>
          <AptechMark height="h-6" className="ml-auto" />
        </div>

        {/* The admin-controlled gate decision, in one glance. */}
        <section className={cn("mt-5 overflow-hidden rounded-3xl shadow-2xl", tone.card, tone.text)} aria-live="polite">
          <div className="px-5 pb-5 pt-6 text-center">
            <tone.Icon className="mx-auto size-10 opacity-90" aria-hidden />
            <p className="mt-2 font-display text-[2.6rem] font-extrabold uppercase leading-none tracking-tight sm:text-5xl">
              {verdict.headline}
            </p>
            <p className="mt-2.5 text-sm font-semibold opacity-90">{verdict.detail}</p>
            {profile.gateNote && <p className={cn("mx-auto mt-3 w-fit rounded-lg px-3 py-1.5 text-xs font-bold", tone.chip)}>{profile.gateNote}</p>}
          </div>

          <div className="border-t border-white/20 px-5 py-4 text-center">
            <p className="font-display text-xl font-bold leading-tight">{profile.name}</p>
            <p className="font-mono text-sm font-bold tracking-wide opacity-80">{profile.studentId}</p>
            {profile.course && <p className="mt-0.5 text-xs font-semibold opacity-75">{profile.course}{profile.batch ? ` · ${profile.batch}` : ""}</p>}
          </div>

          {/* A live, ticking clock: a screenshot from yesterday cannot fake it. */}
          <div className={cn("flex items-center justify-center gap-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider", tone.chip)}>
            {stale || offline ? (
              <>
                <WifiOff className="size-3.5" /> Last checked {relative(age)} — ask them to refresh
              </>
            ) : (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-current" />
                </span>
                Live · {new Date(now).toLocaleTimeString("en-GB")} · {new Date(now).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </>
            )}
          </div>
        </section>

        <button
          onClick={onRefresh}
          disabled={busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-bold text-white ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          {busy ? "Checking…" : "Check again now"}
        </button>

        <Attendance profile={profile} onProfile={onProfile} />

        {!installed && install.state !== "none" && (
          <button
            onClick={() => setSheet(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 py-3 text-sm font-bold text-white/85 hover:border-brand hover:text-white"
          >
            <Download className="size-4 text-brand" /> Save this pass to your phone
          </button>
        )}

        <button onClick={onSignOut} className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-white/40 hover:text-white/70">
          <LogOut className="size-3.5" /> Not you? Sign out of this phone
        </button>
      </div>

      <AnimatePresence>
        {sheet && install.state !== "none" && (
          <InstallSheet
            state={install.state}
            onInstall={() => void install.install().then(() => setSheet(false))}
            onClose={() => {
              setSheet(false);
              try {
                localStorage.setItem(DISMISSED, String(Date.now()));
              } catch {
                /* nothing to remember on a phone with storage off */
              }
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

/**
 * Attendance. Only for a cleared student, because somebody who cannot come in has
 * nothing to sign in to.
 *
 * The countdown runs off the end time the server gave, so it keeps counting with no
 * network and cannot be wound back by changing the phone's clock relative to it.
 */
function Attendance({ profile, onProfile }: { profile: StudentProfile; onProfile: (p: StudentProfile) => void }) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const session = profile.attendance;
  useEffect(() => {
    if (!session?.open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [session?.open]);

  if (!profile.verdict.allowed) return null;

  const left = session?.open ? Math.max(0, new Date(session.endsAt).getTime() - now) : 0;
  const over = Boolean(session?.open) && left === 0;

  const out = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onProfile(await attendanceSignOut(profile.studentId, profile.token));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <p className="text-xs font-bold uppercase tracking-wider text-white/50">Attendance</p>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

      {session?.open ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <Timer className="size-5 shrink-0 self-center text-teal-300" />
            <p className="font-display text-3xl font-extrabold tabular-nums text-teal-300">{over ? "Time up" : countdown(left)}</p>
            <p className="text-xs text-white/50">left</p>
          </div>
          <p className="mt-1 text-xs text-white/55">
            Signed in at {new Date(session.signedInAt).toLocaleTimeString("en-GB")} · signed out automatically at{" "}
            {new Date(session.endsAt).toLocaleTimeString("en-GB")} if you forget.
          </p>
          <button
            onClick={() => void out()}
            disabled={busy}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-bold text-white ring-1 ring-white/15 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Sign out now
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/65">
            Scan the code on the wall as you come in. You are signed out after {Math.round(profile.sessionMinutes / 60 * 10) / 10} hours,
            or whenever you press sign out.
          </p>
          <button
            onClick={() => setScanning(true)}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-white hover:bg-brand-600"
          >
            <QrCode className="size-5" /> Scan to sign in
          </button>
          {session && !session.open && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/45">
              <LogIn className="size-3.5" />
              Last here {new Date(session.signedInAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} for{" "}
              {Math.floor(session.minutes / 60)}h {session.minutes % 60}m
              {session.endedBy === "clock" ? " (signed out by the clock)" : ""}
            </p>
          )}
        </>
      )}

      {scanning && (
        <ScanToSignIn
          studentId={profile.studentId}
          token={profile.token}
          onClose={() => setScanning(false)}
          onSignedIn={(fresh) => {
            onProfile(fresh);
            setScanning(false);
          }}
        />
      )}
    </section>
  );
}

/** 1:47:05 while there is an hour left, 47:05 after that. */
function countdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** "2 minutes ago" — how old the answer on screen is. */
function relative(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "seconds ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ---------------- saving it to the phone ---------------- */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Put off once, left alone for a week. */
const DISMISSED = "apc.student.install.dismissed";
const NAG_AFTER_DAYS = 7;

/**
 * Saving the pass to the home screen is the whole point of it being a web app, so
 * it asks rather than waits to be found: a card slides up a few seconds after the
 * status is on screen — long enough to read the status first, early enough to be
 * seen. Android and desktop Chrome hand us the real install event; iOS has none,
 * so there it is the two taps spelled out, pointing at the Share button.
 */
function useInstall() {
  const deferred = useRef<InstallEvent | null>(null);
  const [state, setState] = useState<"none" | "ready" | "ios">("none");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    // The head script may have caught it before this ever ran.
    const parked = () => (window as unknown as { __apcInstall?: InstallEvent | null }).__apcInstall ?? null;
    const take = () => {
      const e = parked();
      if (e) {
        deferred.current = e;
        setState("ready");
      }
    };
    take();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as InstallEvent;
      setState("ready");
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("apc-installable", take);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iOS Safari never fires beforeinstallprompt.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) setState("ios");
    return () => {
      window.removeEventListener("apc-installable", take);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const e = deferred.current;
    if (!e) return false;
    await e.prompt();
    const choice = await e.userChoice;
    deferred.current = null;
    (window as unknown as { __apcInstall?: InstallEvent | null }).__apcInstall = null;
    setState("none");
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome === "accepted";
  };

  return { state, installed, install };
}

/** The card itself. `force` is the student asking for it again from the footer. */
function InstallSheet({
  state,
  onInstall,
  onClose,
}: {
  state: "ready" | "ios";
  onInstall: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3"
      role="dialog"
      aria-label="Save this pass to your phone"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/15 bg-navy-800 p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-white">Keep your pass on your phone</p>
            <p className="mt-0.5 text-xs text-white/65">
              {state === "ios"
                ? "Add it to your Home Screen and it opens like an app — no typing at the gate."
                : "One tap at the gate, even on a bad network. No address to type."}
            </p>
          </div>
          <button onClick={onClose} aria-label="Not now" className="-m-1 shrink-0 rounded-lg p-1 text-white/45 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        {state === "ios" ? (
          <ol className="mt-3 space-y-1.5 text-xs text-white/75">
            <li className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold">1</span>
              Tap <Share className="size-3.5 text-brand" /> <span className="font-bold text-white">Share</span> at the bottom of Safari
            </li>
            <li className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold">2</span>
              Choose <span className="font-bold text-white">Add to Home Screen</span>
            </li>
          </ol>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onInstall}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600"
            >
              <Download className="size-4" /> Save to my phone
            </button>
            <button onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-bold text-white/55 hover:text-white">
              Not now
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
