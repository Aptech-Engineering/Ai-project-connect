"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUp, Mail, MapPin, Phone, ShieldCheck, Sparkles } from "lucide-react";
import Logo from "./Logo";
import type { Notify } from "./PortalApp";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Track a project", href: "#track" },
      { label: "Submit an idea", href: "#contact" },
      { label: "How it works", href: "#track" },
      { label: "Support plans", href: "#contact" },
    ],
  },
  {
    title: "Learn the stack",
    links: [
      { label: "React & Next.js", href: "#learn" },
      { label: "Node.js back-end", href: "#learn" },
      { label: "Flutter mobile apps", href: "#learn" },
      { label: "All Aptech courses", href: "#learn" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Aptech", href: "#contact" },
      { label: "Our centres", href: "#contact" },
      { label: "Privacy & NDAs", href: "#contact" },
      { label: "Terms", href: "#contact" },
    ],
  },
];

export default function Footer({ notify, onSubmitIdea }: { notify: Notify; onSubmitIdea: (email?: string) => void }) {
  const [email, setEmail] = useState("");

  return (
    <footer id="contact" className="relative isolate overflow-hidden bg-navy text-white">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-700/50 to-transparent"
        style={{ clipPath: "polygon(0 0, 55% 0, 0 80%)" }}
      />
      <svg aria-hidden className="absolute -bottom-72 -right-40 -z-10 size-[700px] animate-spin-slow opacity-60" viewBox="0 0 700 700" fill="none">
        {Array.from({ length: 7 }).map((_, i) => (
          <circle key={i} cx="350" cy="350" r={70 + i * 42} stroke="rgba(160,190,230,0.12)" strokeDasharray={i % 2 ? "4 10" : undefined} />
        ))}
      </svg>

      {/* CTA band */}
      <div className="container-page pt-16 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-600 p-7 shadow-2xl shadow-brand/20 sm:p-10"
        >
          <div
            aria-hidden
            className="absolute -right-10 top-0 h-full w-1/2 bg-navy/15"
            style={{ clipPath: "polygon(30% 0, 100% 0, 100% 100%, 0 100%)" }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-white/85">
                <Sparkles className="size-4" /> Got an idea?
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
                You bring the idea. <br className="hidden sm:block" />
                We&apos;ll build it with you.
              </h2>
              <p className="mt-3 text-white/85">
                No technical skills needed. Tell us the problem, your users and your budget, and our engineers will send a proposal.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^\S+@\S+\.\S+$/.test(email)) {
                  notify("Please enter a valid email address.", "info");
                  return;
                }
                onSubmitIdea(email.trim());
                setEmail("");
              }}
              className="flex w-full flex-col gap-2 rounded-2xl bg-white/15 p-2 backdrop-blur sm:flex-row lg:max-w-md"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                aria-label="Your email address"
                className="h-12 flex-1 rounded-xl bg-white px-4 text-navy outline-none placeholder:text-muted focus:ring-4 focus:ring-navy/20"
              />
              <button className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-navy px-5 font-bold text-white transition hover:bg-navy-950">
                Get started <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>

      {/* links */}
      <div className="container-page grid gap-10 py-14 sm:py-16 lg:grid-cols-[1.3fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm leading-relaxed text-white/60">
            We build your idea. You watch it grow. Then you learn the stack behind it. An Aptech initiative.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-white/70">
            <li className="flex items-center gap-3">
              <Mail className="size-4 text-brand" /> hello@aiprojectconnect.com
            </li>
            <li className="flex items-center gap-3">
              <Phone className="size-4 text-brand" /> +234 700 APTECH (278324)
            </li>
            <li className="flex items-center gap-3">
              <MapPin className="size-4 text-brand" /> Visit any Aptech centre to submit an idea in person
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-display text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      onClick={(e) => {
                        if (l.label === "Submit an idea") {
                          e.preventDefault();
                          onSubmitIdea();
                        }
                      }}
                      className="group inline-flex items-center gap-1 text-sm text-white/60 transition hover:text-white"
                    >
                      <span className="h-px w-0 bg-brand transition-all group-hover:w-3" />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* giant wordmark */}
      <div aria-hidden className="container-page select-none overflow-hidden">
        <p className="bg-gradient-to-b from-white/[0.09] to-transparent bg-clip-text text-center font-display text-[15vw] font-extrabold leading-[0.8] tracking-tighter text-transparent lg:text-[10.5rem]">
          Project Connect
        </p>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/50 sm:flex-row">
          <p>© {new Date().getFullYear()} AI Project Connect by Aptech. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-teal" /> Your ideas are confidential. Access always needs a one-time code.
          </p>
          <div className="flex items-center gap-2">
          <a href="/engineering" className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-brand hover:text-white">
            Staff login
          </a>
          <a href="#top" className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 transition hover:border-brand hover:text-white">
            Back to top <ArrowUp className="size-3" />
          </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
