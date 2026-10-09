"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Loader2, LogOut, Printer, QrCode, RotateCw, Timer, Users } from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  newAttendanceCode,
  setSessionMinutes,
  signOutStudent,
  useAttendance,
  type AttendanceSession,
} from "@/lib/students";
import { useStaff } from "@/lib/staff";
import { useLiveRefresh } from "@/lib/remote";
import { cn } from "@/lib/format";
import type { Notify } from "../PortalApp";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const today = () => new Date().toISOString().slice(0, 10);
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const spell = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

/**
 * Who is in the centre, and the log behind it.
 *
 * It refreshes itself, because the whole point of the number at the top is that it
 * is right now — a count you have to press a button to believe is not worth having.
 */
export default function AttendanceBoard({ notify }: { notify: Notify }) {
  const me = useStaff();
  const [day, setDay] = useState(today());
  const { data, loading, error, refresh } = useAttendance(day === today() ? undefined : day);
  useLiveRefresh(["/staff/students/attendance"], 30000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const { open, done } = useMemo(() => {
    const sessions = data?.sessions ?? [];
    return {
      open: sessions.filter((s) => s.open),
      done: sessions.filter((s) => !s.open),
    };
  }, [data]);

  if (!data) {
    return (
      <div className={card} aria-busy={loading}>
        {error ? (
          <>
            <p className="text-sm text-muted">{error}</p>
            <button onClick={() => void refresh()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-bold">
              <RotateCw className="size-4" /> Try again
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Loading attendance…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="In the centre now" value={String(data.stats.inNow)} tone="teal" icon={<Users className="size-4" />} />
        <Stat label="Signed in today" value={String(data.stats.signedInToday)} />
        <Stat label="Hours today" value={spell(data.stats.minutesToday)} />
      </div>

      <CodeSheet data={data} isAdmin={me.role === "admin"} notify={notify} />

      {/* who is in */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display font-bold">
            <Timer className="mr-1.5 inline size-4 text-teal-700" /> In the centre now
            <span className="ml-2 rounded-lg bg-teal-soft px-2 py-0.5 text-xs font-bold text-teal-700">{open.length}</span>
          </p>
        </div>
        {open.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody is signed in at the moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {open.map((s) => (
              <Row key={s.id} session={s} now={now} notify={notify} />
            ))}
          </ul>
        )}
      </div>

      {/* the log */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display font-bold">
            <CalendarDays className="mr-1.5 inline size-4 text-brand" /> The log
          </p>
          <label className="flex items-center gap-2 text-xs font-bold text-navy">
            Day
            <input
              type="date"
              value={day}
              max={today()}
              onChange={(e) => setDay(e.target.value || today())}
              className="h-9 rounded-lg border border-line px-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
        {done.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No finished sittings on that day.</p>
        ) : (
          <div className="table-scroll mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2 font-semibold">Student</th>
                  <th className="py-2 font-semibold">In</th>
                  <th className="py-2 font-semibold">Out</th>
                  <th className="py-2 font-semibold">Time</th>
                  <th className="py-2 font-semibold">Ended by</th>
                </tr>
              </thead>
              <tbody>
                {done.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2">
                      <span className="font-bold text-navy">{s.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted">{s.ref}</span>
                    </td>
                    <td className="py-2 tabular-nums text-muted">{clock(s.signedInAt)}</td>
                    <td className="py-2 tabular-nums text-muted">{s.signedOutAt ? clock(s.signedOutAt) : "—"}</td>
                    <td className="py-2 tabular-nums font-semibold text-navy">{spell(s.minutes)}</td>
                    <td className="py-2 text-xs text-muted">
                      {s.endedBy === "clock" ? "The clock" : s.endedBy === "staff" ? "Staff" : "They did"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: "teal"; icon?: React.ReactNode }) {
  return (
    <div className={card}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">
        {icon && <span className="mr-1.5 inline-block align-[-2px] text-brand">{icon}</span>}
        {label}
      </p>
      <p className={cn("mt-1 font-display text-2xl font-bold", tone === "teal" && "text-teal-700")}>{value}</p>
    </div>
  );
}

function Row({ session, now, notify }: { session: AttendanceSession; now: number; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, new Date(session.endsAt).getTime() - now);
  const minutesLeft = Math.ceil(left / 60000);

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="min-w-[10rem] flex-1">
        <span className="block font-bold text-navy">{session.name}</span>
        <span className="font-mono text-xs text-muted">{session.ref}</span>
        {session.course && <span className="ml-2 text-xs text-muted">{session.course}</span>}
      </span>
      <span className="text-xs text-muted">in at {clock(session.signedInAt)}</span>
      <span
        className={cn(
          "rounded-lg px-2 py-1 text-xs font-bold tabular-nums",
          minutesLeft <= 15 ? "bg-brand-soft text-brand-700" : "bg-mist text-navy",
        )}
      >
        {minutesLeft > 0 ? `${minutesLeft} min left` : "time up"}
      </span>
      <button
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await signOutStudent(session.studentId);
            notify(`${session.name} signed out.`);
          } catch (e) {
            notify(errorMessage(e), "info");
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-navy hover:border-brand disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
        Sign out
      </button>
    </li>
  );
}

/* ---------------- the sheet that goes on the wall ---------------- */

/**
 * The code students scan, drawn here so it can be printed. Printing uses a window of
 * its own rather than the panel's own page, so what comes out of the printer is the
 * sheet and nothing else — no sidebar, no navigation.
 */
function CodeSheet({
  data,
  isAdmin,
  notify,
}: {
  data: { code: string; scanUrl: string; sessionMinutes: number };
  isAdmin: boolean;
  notify: Notify;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(String(data.sessionMinutes));
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    let live = true;
    void import("qrcode").then(async (QR) => {
      const url = await QR.toDataURL(data.scanUrl, { width: 900, margin: 1, errorCorrectionLevel: "M" });
      if (!live) return;
      setPng(url);
      if (canvas.current) await QR.toCanvas(canvas.current, data.scanUrl, { width: 220, margin: 1 });
    });
    return () => {
      live = false;
    };
  }, [data.scanUrl]);

  const print = () => {
    const sheet = window.open("", "_blank", "width=820,height=1100");
    if (!sheet) {
      notify("Your browser blocked the print window. Allow pop-ups for this site.", "info");
      return;
    }
    sheet.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Attendance code</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: Arial, Helvetica, sans-serif; text-align: center; color: #0b1f3a; }
        h1 { font-size: 34px; margin: 0 0 4px; }
        p { font-size: 17px; color: #39506e; margin: 0 0 22px; }
        img { width: 330px; height: 330px; }
        .code { font-family: "Courier New", monospace; font-size: 46px; letter-spacing: 6px; font-weight: bold; margin: 14px 0 2px; }
        .hint { font-size: 14px; color: #5b6b82; }
        ol { display: inline-block; text-align: left; font-size: 16px; line-height: 1.7; margin-top: 26px; }
      </style></head><body>
      <h1>Sign in here</h1>
      <p>Open your student pass and tap &ldquo;Scan to sign in&rdquo;</p>
      <img src="${png}" alt="Attendance QR code">
      <div class="code">${data.code}</div>
      <div class="hint">If the camera will not work, type this code instead</div>
      <ol>
        <li>Open your student pass on your phone</li>
        <li>Tap &ldquo;Scan to sign in&rdquo;</li>
        <li>Point the camera at the square above</li>
        <li>Check the time, then tap Start</li>
      </ol>
      <p style="margin-top:26px;font-size:14px">You are signed out automatically after ${Math.round((data.sessionMinutes / 60) * 10) / 10} hours.</p>
      </body></html>`);
    sheet.document.close();
    sheet.focus();
    // Give the image a moment to decode, or the sheet prints empty.
    sheet.setTimeout(() => sheet.print(), 400);
  };

  return (
    <div className={cn(card, "flex flex-wrap items-start gap-5")}>
      <canvas ref={canvas} width={220} height={220} className="rounded-xl ring-1 ring-line" aria-label="The attendance QR code" />
      <div className="min-w-[14rem] flex-1">
        <p className="font-display font-bold">
          <QrCode className="mr-1.5 inline size-4 text-brand" /> The code on the wall
        </p>
        <p className="mt-1 text-sm text-muted">
          Print this and put it where students come in. They open their pass, tap &ldquo;Scan to sign in&rdquo;, and point the camera at it.
        </p>
        <p className="mt-2 font-mono text-xl font-bold tracking-widest text-navy">{data.code}</p>
        <p className="text-xs text-muted">Printed under the square, for anyone whose camera will not work.</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={print}
            disabled={!png}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            <Printer className="size-4" /> Print the sheet
          </button>
          {png && (
            <a
              href={png}
              download={`attendance-code-${data.code}.png`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-bold text-navy hover:border-brand"
            >
              Save the image
            </a>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="text-xs font-bold text-navy">
              A sitting lasts
              <span className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={15}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-line px-2 text-sm outline-none focus:border-brand"
                />
                <span className="font-sans font-normal text-muted">minutes</span>
                <button
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    try {
                      const saved = await setSessionMinutes(Number(minutes));
                      notify(`A sitting is now ${saved} minutes.`);
                    } catch (e) {
                      notify(errorMessage(e), "info");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy || Number(minutes) === data.sessionMinutes}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-mist px-2.5 py-1.5 text-xs font-bold text-navy disabled:opacity-40"
                >
                  <Check className="size-3.5" /> Save
                </button>
              </span>
            </label>

            <div className="ml-auto">
              {confirmNew ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-danger">The printed sheet will stop working. Print the new one straight away.</span>
                  <button
                    onClick={async () => {
                      if (busy) return;
                      setBusy(true);
                      try {
                        const result = await newAttendanceCode();
                        notify(`New code ${result.code}. Print the sheet again.`);
                        setConfirmNew(false);
                      } catch (e) {
                        notify(errorMessage(e), "info");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="cursor-pointer rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Issue a new code
                  </button>
                  <button onClick={() => setConfirmNew(false)} className="cursor-pointer px-2 py-1.5 text-xs font-bold text-muted">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmNew(true)}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold text-muted hover:text-navy"
                >
                  Issue a new code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
