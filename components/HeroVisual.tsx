"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Bell, GraduationCap } from "lucide-react";
import { TIMELINE } from "@/lib/data";

const FEED = [
  { date: "12 Sep", text: "Payment integration merged" },
  { date: "09 Sep", text: "Farmer onboarding screens done" },
  { date: "04 Sep", text: "Design sign-off received" },
  { date: "28 Aug", text: "Database schema approved" },
];

const STACK = [
  { name: "React", use: "Web front-end" },
  { name: "Node.js", use: "API server" },
  { name: "PostgreSQL", use: "Database" },
  { name: "Flutter", use: "Android app" },
];

export default function HeroVisual() {
  const [pct, setPct] = useState(0);
  const [tick, setTick] = useState(0);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 120, damping: 14 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 120, damping: 14 });

  useEffect(() => {
    const controls = animate(0, 62, { duration: 1.8, delay: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setPct(Math.round(v)) });
    const i = window.setInterval(() => setTick((t) => t + 1), 3200);
    return () => {
      controls.stop();
      window.clearInterval(i);
    };
  }, []);

  const feed = FEED.map((_, i) => FEED[(i + tick) % FEED.length]);
  const highlight = tick % STACK.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto hidden w-full max-w-[520px] [perspective:1400px] sm:block"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      aria-hidden
    >
      <div className="absolute -inset-10 rounded-full bg-brand/15 blur-3xl" />

      <motion.div style={{ rotateX, rotateY }} className="relative [transform-style:preserve-3d]">
        <div className="overflow-hidden rounded-3xl border border-white/15 bg-white text-navy shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)]">
          {/* window chrome */}
          <div className="flex items-center justify-between bg-navy px-5 py-3.5">
            <span className="font-display text-sm font-semibold text-white">AI Project Connect</span>
            <span className="text-[11px] text-white/60">Client Portal · Ada O.</span>
          </div>

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold leading-tight">FarmLink Marketplace</p>
                <p className="mt-0.5 text-[11px] text-muted">APC-26-7KQ9X · Web + Android · Est. 30 Nov 2026</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-brand-700">
                IN DEVELOPMENT
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs">
              <span>Overall progress</span>
              <span className="font-display font-bold tabular-nums">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line">
              <div className="relative h-full rounded-full bg-brand transition-[width] duration-100" style={{ width: `${pct}%` }}>
                <span className="absolute inset-y-0 left-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </div>
            </div>

            <div className="relative mt-5 flex justify-between">
              <div className="absolute inset-x-1.5 top-[5px] h-0.5 bg-line" />
              <motion.div
                className="absolute left-1.5 top-[5px] h-0.5 bg-teal"
                initial={{ width: 0 }}
                animate={{ width: "40%" }}
                transition={{ delay: 1.2, duration: 1 }}
              />
              {TIMELINE.map((s, i) => (
                <div key={s} className="relative flex flex-col items-center gap-1.5">
                  <span
                    className={
                      i < 2
                        ? "size-3 rounded-full bg-teal"
                        : i === 2
                          ? "relative size-3 rounded-full bg-brand ring-4 ring-brand/20"
                          : "size-3 rounded-full bg-line"
                    }
                  />
                  <span className={`text-[9px] ${i <= 2 ? "text-navy" : "text-muted"}`}>{s}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-mist p-3">
                <p className="font-display text-[11px] font-bold">Latest updates</p>
                <ul className="mt-2 space-y-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {feed.map((f, i) => (
                      <motion.li
                        key={f.text}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-1.5 text-[10px] leading-snug"
                      >
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${i === 0 ? "bg-brand" : "bg-teal"}`} />
                        <span className="w-9 shrink-0 font-bold text-muted">{f.date}</span>
                        <span className="line-clamp-1">{f.text}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
              <div className="rounded-xl bg-navy p-3 text-white">
                <p className="font-display text-[11px] font-bold">What your app is built with</p>
                <ul className="mt-2 space-y-1.5">
                  {STACK.map((s, i) => (
                    <li key={s.name} className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-semibold">{s.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[8px] font-bold transition-all duration-500 ${
                          i === highlight ? "scale-110 bg-brand text-white shadow-md shadow-brand/40" : "bg-brand/80 text-white/90"
                        }`}
                      >
                        Learn this
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* floating notifications */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
          transition={{ opacity: { delay: 1.6 }, x: { delay: 1.6 }, y: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
          style={{ transform: "translateZ(60px)" }}
          className="absolute -left-10 top-24 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-navy-800/95 px-3.5 py-2.5 shadow-2xl backdrop-blur lg:-left-16"
        >
          <span className="grid size-8 place-items-center rounded-full bg-brand/20">
            <Bell className="size-4 text-brand" />
          </span>
          <span>
            <span className="block text-[10px] text-white/50">New update · 2 min ago</span>
            <span className="block text-xs font-bold text-white">Payment integration merged</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0, y: [0, 8, 0] }}
          transition={{ opacity: { delay: 1.9 }, x: { delay: 1.9 }, y: { duration: 6, repeat: Infinity, ease: "easeInOut" } }}
          className="absolute -bottom-6 -right-4 flex items-center gap-2.5 rounded-2xl bg-teal px-3.5 py-2.5 text-white shadow-2xl shadow-teal/30 lg:-right-8"
        >
          <GraduationCap className="size-5" />
          <span>
            <span className="block text-[10px] text-white/80">Curious how it works?</span>
            <span className="block text-xs font-bold">Learn React · starts next month</span>
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
