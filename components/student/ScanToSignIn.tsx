"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Keyboard, Loader2, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { attendanceSignIn, type StudentProfile } from "@/lib/students";
import { cn } from "@/lib/format";

/**
 * Signing in at the gate.
 *
 * The camera reads the code off the sheet on the wall, and because a camera can be
 * refused, broken or simply too dark, the same code is printed underneath it in
 * letters — typing that in does exactly the same thing.
 *
 * Nothing is recorded until the student has seen the time and agreed to it, so a
 * scan on the way past the sheet does not quietly start their sitting.
 */
export function ScanToSignIn({
  studentId,
  token,
  onSignedIn,
  onClose,
}: {
  studentId: string;
  token: string;
  onSignedIn: (profile: StudentProfile) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<"camera" | "typing" | "confirm">("camera");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // The clock on the confirmation screen is the time that will be recorded.
  useEffect(() => {
    if (step !== "confirm") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== "camera") {
      stop();
      return;
    }
    let cancelled = false;
    let frame = 0;

    const run = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => undefined);
        }
      } catch {
        setError("We could not open the camera. Type the code printed under the QR instead.");
        setStep("typing");
        return;
      }

      const jsQR = (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const read = () => {
        if (cancelled) return;
        const v = video.current;
        if (v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
          // A small frame is plenty for a QR and keeps an old phone responsive.
          const width = 480;
          const height = Math.round((v.videoHeight / v.videoWidth) * width) || 360;
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(v, 0, 0, width, height);
          const found = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" });
          if (found?.data) {
            setCode(readCode(found.data));
            setStep("confirm");
            setNow(Date.now());
            return;
          }
        }
        frame = requestAnimationFrame(read);
      };
      frame = requestAnimationFrame(read);
    };

    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
    };
  }, [step, stop]);

  useEffect(() => stop, [stop]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await attendanceSignIn(studentId, token, code));
    } catch (e) {
      setError(errorMessage(e));
      setStep("typing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/90 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-label="Sign in at the gate">
      <div className="w-full max-w-sm rounded-2xl bg-navy-800 p-5 text-white shadow-2xl">
        <div className="flex items-start gap-3">
          <p className="flex-1 font-display text-lg font-bold">
            {step === "confirm" ? "Start your attendance" : "Sign in at the gate"}
          </p>
          <button onClick={onClose} aria-label="Close" className="-m-1 rounded-lg p-1 text-white/45 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/15 p-3 text-xs text-red-200 ring-1 ring-red-500/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        {step === "camera" && (
          <>
            <p className="mt-1 text-sm text-white/65">Point your camera at the code on the wall.</p>
            <div className="relative mt-3 aspect-square overflow-hidden rounded-2xl bg-black">
              <video ref={video} playsInline muted className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
            </div>
            <button
              onClick={() => setStep("typing")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold text-white ring-1 ring-white/15"
            >
              <Keyboard className="size-4" /> Type the code instead
            </button>
          </>
        )}

        {step === "typing" && (
          <>
            <p className="mt-1 text-sm text-white/65">Type the code printed under the QR on the wall.</p>
            <input
              id="attendance-code"
              value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              autoCapitalize="characters"
              autoFocus
              className="mt-3 h-14 w-full rounded-xl border border-white/15 bg-white/5 text-center font-mono text-2xl tracking-widest text-white outline-none placeholder:text-white/25 focus:border-brand"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setCode(typed.trim());
                  setNow(Date.now());
                  setStep("confirm");
                }}
                disabled={typed.trim().length < 4}
                className="h-12 flex-1 rounded-xl bg-brand text-sm font-bold text-white disabled:opacity-40"
              >
                Continue
              </button>
              <button onClick={() => { setError(""); setStep("camera"); }} className="h-12 rounded-xl bg-white/10 px-4 text-sm font-bold text-white">
                <Camera className="size-4" />
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <p className="mt-1 text-sm text-white/65">This is the time that will be recorded.</p>
            <div className="mt-4 rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10">
              <p className="font-display text-4xl font-extrabold tabular-nums">{new Date(now).toLocaleTimeString("en-GB")}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/50">
                {new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <p className="mt-3 text-xs text-white/55">
              Your time starts when you press start, and you will be signed out automatically at the end of the sitting if you forget.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void confirm()}
                disabled={busy}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {busy ? "Starting…" : "Start"}
              </button>
              <button onClick={onClose} className="h-12 rounded-xl px-4 text-sm font-bold text-white/55">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The sheet's QR holds a link; the code is the part we need out of it. */
function readCode(scanned: string): string {
  try {
    const url = new URL(scanned);
    return url.searchParams.get("scan") ?? scanned;
  } catch {
    return scanned.trim();
  }
}
