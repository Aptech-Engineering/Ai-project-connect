"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Loader2, LogOut, RefreshCw, Share, WifiOff, XCircle } from "lucide-react";
import { errorMessage, ApiError } from "@/lib/api";
import { studentSignIn, studentStatus, type StudentProfile } from "@/lib/students";
import { cn } from "@/lib/format";
import AptechMark from "../AptechMark";

/** The phone remembers who it belongs to, and the last answer it was given. */
const STORE = "apc.student.v1";

const money = (amount: number, currency = "NGN") =>
  (currency === "NGN" ? "₦" : currency + " ") + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount);

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
    />
  );
}

/* ---------------- signing in ---------------- */

function SignIn({ error, onDone }: { error: string; onDone: (p: StudentProfile) => void }) {
  const [form, setForm] = useState({ studentId: "", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const valid = form.studentId.trim().length > 2 && form.firstName.trim().length > 1 && form.lastName.trim().length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setProblem("");
    try {
      onDone(await studentSignIn({ studentId: form.studentId.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim() }));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field = "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base text-white outline-none placeholder:text-white/35 focus:border-brand";

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
          Sign in once. Your phone remembers you, so at the gate you just open this page and show it.
        </p>

        {(problem || error) && (
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-red-500/15 p-3 text-sm text-red-200 ring-1 ring-red-500/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {problem || error}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-white/55">
            Student ID
            <input
              id="student-id"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              placeholder="APC/26/0001"
              autoCapitalize="characters"
              autoComplete="username"
              className={cn(field, "mt-1.5 font-mono")}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-white/55">
            First name
            <input
              id="student-first"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="Emmanuel"
              autoComplete="given-name"
              className={cn(field, "mt-1.5")}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-white/55">
            Last name
            <input
              id="student-last"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Adewunmi"
              autoComplete="family-name"
              className={cn(field, "mt-1.5")}
            />
          </label>
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
          Don&rsquo;t know your Student ID? Ask at the front desk. Nobody can see your record without it.
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
}: {
  profile: StudentProfile;
  busy: boolean;
  offline: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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

        {/* Everything the guard needs, in one glance. */}
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

        {/* The money, for the student rather than the guard. */}
        <section className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure label="Course fee" value={money(profile.fee, profile.currency)} />
            <Figure label="Paid" value={money(profile.paid, profile.currency)} tone="text-emerald-300" />
            <Figure
              label="Outstanding"
              value={money(profile.outstanding, profile.currency)}
              tone={profile.outstanding > 0 ? "text-red-300" : "text-emerald-300"}
            />
          </div>
          {profile.dueOn && profile.outstanding > 0 && (
            <p className="mt-3 border-t border-white/10 pt-3 text-center text-xs text-white/60">
              Balance due by {new Date(profile.dueOn + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </section>

        {profile.payments.length > 0 && (
          <section className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-bold uppercase tracking-wider text-white/50">Your payments</p>
            <ul className="mt-2 divide-y divide-white/10">
              {profile.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-bold">{money(p.amount, profile.currency)}</span>
                    <span className="ml-2 text-xs text-white/50">{p.method}</span>
                  </span>
                  <span className="text-xs text-white/60">
                    {new Date(p.paidOn + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-white/40">If a payment is missing here, show your receipt at the front desk.</p>
          </section>
        )}

        <InstallPrompt />

        <button onClick={onSignOut} className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-white/40 hover:text-white/70">
          <LogOut className="size-3.5" /> Not you? Sign out of this phone
        </button>
      </div>
    </main>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">{label}</p>
      <p className={cn("mt-0.5 font-display text-base font-bold", tone)}>{value}</p>
    </div>
  );
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

/**
 * Android and desktop Chrome hand us an install event; iOS has none, so there it is
 * a one-line instruction instead. Either way the student stops typing the address.
 */
function InstallPrompt() {
  const deferred = useRef<InstallEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setDone(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as InstallEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iOS Safari never fires it.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setIosHint(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (done) return null;

  if (canInstall) {
    return (
      <button
        onClick={async () => {
          const e = deferred.current;
          if (!e) return;
          await e.prompt();
          const choice = await e.userChoice;
          if (choice.outcome === "accepted") setDone(true);
          deferred.current = null;
          setCanInstall(false);
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 py-3 text-sm font-bold text-white/85 hover:border-brand hover:text-white"
      >
        <Download className="size-4 text-brand" /> Save this pass to your phone
      </button>
    );
  }

  if (iosHint) {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-white/20 p-3 text-xs text-white/60">
        <Share className="mt-0.5 size-4 shrink-0 text-brand" />
        To keep this on your phone: tap <span className="font-bold text-white/85">Share</span>, then{" "}
        <span className="font-bold text-white/85">Add to Home Screen</span>.
      </p>
    );
  }

  return null;
}
