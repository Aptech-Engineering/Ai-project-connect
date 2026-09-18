"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { KeyRound, MessageSquareText, GraduationCap } from "lucide-react";
import Tracker from "./Tracker";
import HeroVisual from "./HeroVisual";
import { useTechnologies } from "@/lib/catalog";
import { useSiteContent } from "@/lib/content";
import type { Project } from "@/lib/types";

const TRUST_ICONS = [KeyRound, MessageSquareText, GraduationCap];

export default function Hero({
  onVerified,
  onReset,
  verifiedProject,
}: {
  onVerified: (code: string) => void;
  onReset: () => void;
  verifiedProject?: Project;
}) {
  const ref = useRef<HTMLElement>(null);
  const { hero } = useSiteContent();
  const titleLines = [hero.titleLine1, hero.titleLine2].map((l) => l.split(/\s+/).filter(Boolean));

  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  let wordIndex = 0;

  return (
    <section
      id="top"
      ref={ref}
      onPointerMove={onPointerMove}
      className="relative isolate overflow-hidden bg-navy pt-16 text-white"
    >
      <Backdrop />

      <div id="track" className="container-page relative grid scroll-mt-16 items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pb-24 lg:pt-20">
        <div className="relative z-10">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {hero.eyebrow}
          </motion.span>

          <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.1rem]">
            {titleLines.map((line, li) => (
              <span key={li} className="block">
                {line.map((w) => {
                  const i = wordIndex++;
                  return [
                    <motion.span
                      key={w + i}
                      className="inline-block"
                      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ delay: 0.1 + i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {w}
                    </motion.span>,
                    " ",
                  ];
                })}
                {li === 1 && hero.highlight && (
                  <motion.span
                    className="relative inline-block text-brand"
                    initial={{ opacity: 0, y: 28, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.75, type: "spring", stiffness: 260, damping: 18 }}
                  >
                    {hero.highlight}
                    <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 16" fill="none" aria-hidden>
                      <motion.path
                        d="M3 11 C 50 3, 120 3, 197 9"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 1.05, duration: 0.7, ease: "easeInOut" }}
                      />
                    </svg>
                  </motion.span>
                )}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-blue-soft/75"
          >
            {hero.subtitleLead && <span className="font-bold text-white">{hero.subtitleLead}</span>} {hero.subtitle}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }} className="mt-8">
            <Tracker onVerified={onVerified} onReset={onReset} verifiedProject={verifiedProject} />
          </motion.div>

          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 1.3 } } }}
            className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65"
          >
            {hero.trustPoints.filter(Boolean).map((text, i) => ({ icon: TRUST_ICONS[i % TRUST_ICONS.length], text })).map(({ icon: Icon, text }) => (
              <motion.li key={text} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="flex items-center gap-2">
                <Icon className="size-4 text-teal" /> {text}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {hero.showPreviewCard && <HeroVisual />}
      </div>

      <StackMarquee />
    </section>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* diagonal lighter-navy panel from the PRD cover */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-navy-700/70 to-navy-800/40"
        style={{ clipPath: "polygon(46% 0, 100% 0, 100% 72%)" }}
      />
      <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />

      {/* concentric circles */}
      <svg className="absolute -right-40 -top-56 size-[900px] opacity-70 sm:-right-24" viewBox="0 0 900 900" fill="none">
        {Array.from({ length: 9 }).map((_, i) => (
          <circle key={i} cx="450" cy="450" r={60 + i * 48} stroke="rgba(160,190,230,0.16)" strokeWidth="1" />
        ))}
      </svg>
      <div className="absolute -right-10 top-0 size-[520px] sm:right-24">
        {[0, 2, 4].map((d) => (
          <span
            key={d}
            className="absolute inset-0 animate-ripple rounded-full border border-brand/30"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>

      {/* orange triangle */}
      <motion.div
        className="absolute right-0 top-[44%] hidden h-64 w-56 bg-gradient-to-l from-brand to-brand-600 lg:block"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 50%)" }}
        initial={{ x: 120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* cursor spotlight */}
      <div
        className="absolute inset-0 opacity-80 transition-opacity"
        style={{
          background:
            "radial-gradient(520px circle at var(--mx, 30%) var(--my, 40%), rgba(242,107,34,0.10), transparent 60%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy-950/60 to-transparent" />
    </div>
  );
}

function StackMarquee() {
  const techs = useTechnologies();
  const { hero } = useSiteContent();
  if (techs.length === 0) return null;
  const row = [...techs, ...techs];
  return (
    <div id="learn" className="relative border-t border-white/10 bg-navy-950/40 py-5 backdrop-blur-sm">
      <div className="container-page flex items-center gap-6">
        <p className="hidden shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-white/50 md:block">
          {hero.marqueeTitle}
          <br />
          <span className="text-brand">{hero.marqueeSubtitle}</span>
        </p>
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
            {row.map((t, i) => (
              <span
                key={t.id + i}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-sm text-white/80"
              >
                <span
                  className="grid size-7 place-items-center rounded-full bg-navy-700 font-display text-[10px] font-bold"
                  style={{ color: t.color }}
                >
                  {t.mark}
                </span>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
