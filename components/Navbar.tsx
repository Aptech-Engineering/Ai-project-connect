"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, Sparkles, X } from "lucide-react";
import Logo from "./Logo";
import { cn, initials } from "@/lib/format";

const LINKS = [
  { href: "#track", label: "Track a project" },
  { href: "#learn", label: "Learn the stack" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar({ client, onSignOut, onSubmitIdea }: { client?: string; onSignOut: () => void; onSubmitIdea: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitIdea = () => {
    setOpen(false);
    onSubmitIdea();
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-white/10 bg-navy/85 shadow-lg shadow-navy-950/20 backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <nav className="container-page flex h-16 items-center justify-between gap-4">
        <a href="#top" aria-label="AI Project Connect home">
          <Logo />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {client ? (
            <>
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm text-white">
                <span className="grid size-7 place-items-center rounded-full bg-teal text-[11px] font-bold">{initials(client)}</span>
                {client}
              </span>
              <button onClick={onSignOut} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white/70 hover:text-white">
                <LogOut className="size-4" /> Sign out
              </button>
            </>
          ) : (
            <button
              onClick={submitIdea}
              className="group flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-600"
            >
              <Sparkles className="size-4 transition group-hover:rotate-12" /> Submit your idea
            </button>
          )}
        </div>

        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-white md:hidden" aria-label="Menu" aria-expanded={open}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 bg-navy md:hidden"
          >
            <div className="container-page flex flex-col gap-1 py-4">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-white/80 hover:bg-white/5">
                  {l.label}
                </a>
              ))}
              {client ? (
                <button
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="mt-2 flex items-center justify-center gap-2 rounded-full border border-white/15 py-3 font-bold text-white"
                >
                  <LogOut className="size-4" /> Sign out ({client})
                </button>
              ) : (
                <button onClick={submitIdea} className="mt-2 flex items-center justify-center gap-2 rounded-full bg-brand py-3 font-bold text-white">
                  <Sparkles className="size-4" /> Submit your idea
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
