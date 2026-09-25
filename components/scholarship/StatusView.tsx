"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Download, Loader2, MapPin, RotateCw } from "lucide-react";
import { useScholarshipStatus } from "@/lib/scholarship";
import { formatDay, money, StatusPill } from "./ScholarshipPage";

/**
 * Where an applicant lands after paying, and the link we email them. Shows what
 * happened to the fee, and — once it clears — the form and the exam details.
 */
export function StatusView({ refCode, token, payment }: { refCode: string | null; token: string | null; payment: string | null }) {
  const { application, loading, error, refresh } = useScholarshipStatus(refCode, token);
  const [checking, setChecking] = useState(payment === "pending");

  // Coming back from Paystack, the fee can take a moment to settle: look again.
  useEffect(() => {
    if (!checking) return;
    const id = window.setInterval(() => void refresh(), 4000);
    const stop = window.setTimeout(() => setChecking(false), 30000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [checking, refresh]);

  if (!refCode || !token) {
    return (
      <Shell>
        <p className="font-display text-lg font-bold text-navy">This link is incomplete</p>
        <p className="mt-1 text-sm text-muted">Open the link from your email, or apply again from the scholarship page.</p>
        <Link href="/scholarship" className="mt-4 inline-block rounded-xl bg-navy px-5 py-2.5 text-sm font-bold text-white">
          Back to the programme
        </Link>
      </Shell>
    );
  }

  if (loading && !application) {
    return (
      <Shell>
        <Loader2 className="mx-auto size-7 animate-spin text-brand" />
        <p className="mt-3 text-sm text-muted">Loading your application…</p>
      </Shell>
    );
  }

  if (!application) {
    return (
      <Shell>
        <AlertTriangle className="mx-auto size-7 text-danger" />
        <p className="mt-3 font-display font-bold text-navy">We couldn&rsquo;t find that application</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <button onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-bold text-navy">
          <RotateCw className="size-4" /> Try again
        </button>
      </Shell>
    );
  }

  const a = application;
  return (
    <main className="min-h-screen bg-mist py-10">
      <div className="container-page max-w-2xl">
        <Link href="/scholarship" className="text-sm font-semibold text-muted hover:text-navy">
          ← Scholarship programme
        </Link>

        <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-brand to-teal" />
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Your application</p>
                <h1 className="font-display text-2xl font-bold text-navy">{a.name}</h1>
                <p className="mt-0.5 font-mono text-sm text-muted">{a.ref}</p>
              </div>
              <StatusPill status={a.status} />
            </div>

            {a.status === "PENDING" && (
              <Note tone="warning">
                Your form fee of {money(a.amount, a.currency)} has not been paid yet. Go back to the scholarship page to pay by card or bank transfer.
              </Note>
            )}
            {a.status === "AWAITING_CONFIRMATION" && (
              <Note tone="info">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" /> We are checking your transfer. You will get an email as soon as it is confirmed.
                </span>
              </Note>
            )}
            {a.status === "FAILED" && <Note tone="danger">{a.failureReason ?? "That payment did not go through. Please try again."}</Note>}

            {a.status === "PAID" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-teal/30 bg-teal-soft/50 p-4">
                  <p className="flex items-center gap-2 font-display font-bold text-teal-700">
                    <CheckCircle2 className="size-5" /> Form fee confirmed
                  </p>
                  {a.form ? (
                    <>
                      <p className="mt-1 text-sm text-navy">Download your application form, fill it in and bring it to the centre on exam day.</p>
                      <a
                        href={a.form.url}
                        className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-navy px-5 font-bold text-white transition hover:bg-navy-800"
                      >
                        <Download className="size-4" /> {a.form.label}
                      </a>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-navy">
                      Your form is being prepared. We will email you the moment it is ready — this page will show it too.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-line p-4">
                  <p className="font-display font-bold text-navy">Your exam</p>
                  {a.batch ? (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      <li className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-brand" />
                        <span className="font-bold text-navy">{a.batch.name}</span>
                        <span className="text-muted">
                          · {formatDay(a.batch.examDate) ?? "date to be confirmed"}
                          {a.batch.examTime ? `, ${a.batch.examTime}` : ""}
                        </span>
                      </li>
                      {a.batch.venue && (
                        <li className="flex items-start gap-2 text-muted">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-brand" /> {a.batch.venue}
                        </li>
                      )}
                      {a.batch.notes && <li className="text-muted">{a.batch.notes}</li>}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      You have not been placed in an exam batch yet. We will email you the date and venue shortly.
                    </p>
                  )}
                </div>
              </div>
            )}

            <dl className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-5 text-sm sm:grid-cols-2">
              <Detail label="Email" value={a.email} />
              <Detail label="Phone" value={a.phone} />
              <Detail label="Address" value={a.address} />
              <Detail label="State" value={a.state} />
              <Detail label="Nationality" value={a.nationality} />
              <Detail label="Course" value={a.course ?? "Not chosen yet"} />
              <Detail label="Form fee" value={money(a.amount, a.currency)} />
              <Detail label="Reference" value={a.reference ?? a.ref} />
            </dl>

            <p className="mt-5 text-xs text-muted">
              Keep this page bookmarked — it is your own link. {a.status !== "PAID" && "Nothing is shared with anyone else."}
            </p>
          </div>
        </div>

        <button onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-navy">
          <RotateCw className={checking ? "size-4 animate-spin" : "size-4"} /> {checking ? "Checking your payment…" : "Refresh"}
        </button>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-mist px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-sm">{children}</div>
    </main>
  );
}

function Note({ tone, children }: { tone: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const tones = {
    info: "border-blue/20 bg-blue-soft text-blue-700",
    warning: "border-brand/20 bg-brand-soft text-brand-700",
    danger: "border-danger/20 bg-danger-soft text-danger",
  };
  return <div className={`mt-5 rounded-2xl border p-4 text-sm font-medium ${tones[tone]}`}>{children}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-navy sm:mt-0.5">{value}</dd>
    </div>
  );
}
