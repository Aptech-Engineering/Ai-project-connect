"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, ClipboardCheck, FilePlus2, Mail, PenLine, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { useIdeas } from "@/lib/ideas";
import WalletLedger from "../wallet/WalletLedger";
import { CHANGE_STATUS, clientRequestChange, clientRespondChange, clientSignHandover, impactText, setDigestOptOut } from "@/lib/flows";
import { formatPrice } from "@/lib/catalog";
import { useSiteContent } from "@/lib/content";
import { cn, formatDate, relativeDay } from "@/lib/format";
import type { Project } from "@/lib/types";
import type { Notify } from "../PortalApp";

const card = "rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-7";
const inputClass = "w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/* ---------------- change requests ---------------- */

export function ChangeRequestsPanel({ project, notify }: { project: Project; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const requests = project.changeRequests ?? [];
  const waiting = requests.filter((r) => r.status === "QUOTED").length;
  const locked = project.stage === "DELIVERED";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-display text-lg font-bold">
            <FilePlus2 className="size-5 text-brand" /> Change requests
          </h4>
          <p className="mt-0.5 text-sm text-muted">Want something added or changed? We'll tell you the cost and time before any work starts.</p>
        </div>
        {waiting > 0 && <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase text-white">{waiting} needs your decision</span>}
      </div>

      <ul className="mt-5 space-y-3">
        {requests.map((cr) => (
          <li key={cr.id} className={cn("rounded-2xl border p-4", cr.status === "QUOTED" ? "border-brand/40 bg-brand-soft/30" : "border-line")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display font-semibold">{cr.title}</p>
              <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", CHANGE_STATUS[cr.status].className)}>{CHANGE_STATUS[cr.status].label}</span>
            </div>
            <p className="mt-1 text-sm text-navy/75">{cr.description}</p>
            <p className="mt-1 text-xs text-muted">
              {cr.requestedBy === "client" ? "You asked" : `Raised by ${cr.requesterName}`} · {relativeDay(cr.createdAt)}
            </p>
            {(cr.impactCost != null || cr.impactDays != null) && (
              <div className="mt-3 rounded-xl bg-white px-3.5 py-2.5 text-sm">
                <p className="font-bold">Impact: {impactText(cr)}</p>
                {cr.responseNote && <p className="mt-1 whitespace-pre-line text-muted">{cr.responseNote}</p>}
              </div>
            )}
            {cr.status === "QUOTED" && (
              <AnimatePresence mode="wait" initial={false}>
                {declining === cr.id ? (
                  <motion.form
                    key="decline"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden"
                    onSubmit={(e) => {
                      e.preventDefault();
                      clientRespondChange(project, cr, "decline", note.trim() || undefined);
                      setDeclining(null);
                      setNote("");
                      notify("Change declined. Your team has been told.", "info");
                    }}
                  >
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: tell us why" className={cn(inputClass, "h-10")} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDeclining(null)} className="h-10 flex-1 rounded-xl border border-line text-sm font-bold text-muted">
                        Back
                      </button>
                      <button className="h-10 flex-1 rounded-xl bg-navy text-sm font-bold text-white">Decline change</button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setDeclining(cr.id)} className="h-10 rounded-xl border border-line bg-white text-sm font-bold text-muted hover:text-navy">
                      Decline
                    </button>
                    <button
                      onClick={() => {
                        clientRespondChange(project, cr, "approve");
                        notify(cr.impactDays && cr.impactDays > 0 ? `Approved. Your delivery date moves by ${cr.impactDays} days.` : "Approved. Your team will start on it.");
                      }}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-600"
                    >
                      <Check className="size-4" /> Approve
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </li>
        ))}
        {requests.length === 0 && <li className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No change requests yet.</li>}
      </ul>

      {!locked && (
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.form
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-2 overflow-hidden rounded-2xl bg-mist p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim().length < 3 || description.trim().length < 10) return;
                clientRequestChange(project, title.trim(), description.trim());
                setTitle("");
                setDescription("");
                setOpen(false);
                notify(`Change request sent to ${project.lead.name}. You'll get the cost and time impact before anything changes.`);
              }}
            >
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should change? e.g. Add pay on delivery" className={cn(inputClass, "h-11")} aria-label="Change title" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe it in your own words" className={cn(inputClass, "resize-none py-2.5")} aria-label="Change description" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="h-10 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-muted">
                  Cancel
                </button>
                <button disabled={title.trim().length < 3 || description.trim().length < 10} className="h-10 flex-1 rounded-xl bg-navy text-sm font-bold text-white disabled:opacity-40">
                  Send request
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setOpen(true)}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-bold text-muted transition hover:border-navy/30 hover:text-navy"
            >
              <PenLine className="size-4" /> Request a change
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/* ---------------- handover ---------------- */

export function HandoverPanel({ project, notify }: { project: Project; notify: Notify }) {
  const { supportPlans } = useSiteContent();
  const handover = project.handover;
  const [plan, setPlan] = useState(supportPlans.plans[1]?.id ?? supportPlans.plans[0]?.id ?? "");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  if (!handover || (!handover.requestedAt && handover.items.length === 0)) return null;

  const done = handover.items.filter((i) => i.doneAt).length;
  const signedPlan = supportPlans.plans.find((p) => p.id === handover.supportPlan);
  const canSign = Boolean(handover.requestedAt) && !handover.signedAt;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={cn(card, canSign && "border-teal/40 ring-4 ring-teal/10")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-display text-lg font-bold">
            <ClipboardCheck className="size-5 text-teal" /> Handover
          </h4>
          <p className="mt-0.5 text-sm text-muted">
            {handover.signedAt ? `Signed by ${handover.signedName} on ${formatDate(handover.signedAt)}.` : canSign ? "Your product is ready. Review the checklist, choose a support plan and sign off." : "Your team is preparing everything you need to own your product."}
          </p>
        </div>
        <span className="font-display text-sm font-bold text-muted">
          {done}/{handover.items.length} done
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full rounded-full bg-teal" initial={{ width: 0 }} animate={{ width: `${handover.items.length ? (done / handover.items.length) * 100 : 0}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {handover.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 text-sm">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", item.doneAt ? "bg-teal text-white" : "border-2 border-line")}>{item.doneAt && <Check className="size-3" strokeWidth={3} />}</span>
            <span className={cn(item.doneAt ? "text-navy" : "text-muted")}>{item.title}</span>
          </li>
        ))}
      </ul>

      {handover.signedAt ? (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-teal-soft px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="size-5 shrink-0" /> Support plan: <b>{signedPlan?.name ?? handover.supportPlan}</b>
        </p>
      ) : canSign ? (
        <form
          className="mt-6 space-y-4 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2 || !agree || !plan) return;
            clientSignHandover(project, name.trim(), plan);
            notify("Handover signed. Congratulations on your new product!");
          }}
        >
          <div>
            <p className="font-display font-semibold">{supportPlans.title}</p>
            <p className="text-sm text-muted">{supportPlans.subtitle}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Support plan">
            {supportPlans.plans.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={plan === p.id}
                onClick={() => setPlan(p.id)}
                className={cn("rounded-2xl border p-3 text-left transition", plan === p.id ? "border-brand bg-brand-soft/40 ring-2 ring-brand/25" : "border-line hover:border-navy/30")}
              >
                <p className="font-display text-sm font-bold">{p.name}</p>
                <p className="mt-0.5 text-sm font-bold">
                  {p.price ? formatPrice(p.price, p.currency) : "Free"}
                  {p.period && <span className="font-normal text-muted"> / {p.period}</span>}
                </p>
                <ul className="mt-2 space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-1.5 text-[11px] leading-snug text-muted">
                      <Check className="mt-0.5 size-3 shrink-0 text-teal" /> {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            I confirm I've received everything on the checklist and accept the product as delivered.
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full name to sign" aria-label="Your full name" className={cn(inputClass, "h-11 flex-1")} />
            <button disabled={name.trim().length < 2 || !agree} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40">
              <ShieldCheck className="size-4" /> Sign off handover
            </button>
          </div>
        </form>
      ) : null}
    </motion.div>
  );
}

/* ---------------- weekly email preference ---------------- */

export function EmailPreferences({ project, notify }: { project: Project; notify: Notify }) {
  const on = !project.digestOptOut;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex items-center justify-between gap-4 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-navy">
          <Mail className="size-5" />
        </span>
        <div>
          <p id="digest-label" className="font-display font-semibold">
            Weekly progress email
          </p>
          <p className="text-sm text-muted">A short summary every Monday. You always keep access to this page.</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-labelledby="digest-label"
        onClick={() => {
          setDigestOptOut(project, on);
          notify(on ? "Weekly emails turned off." : "Weekly emails turned on.", "info");
        }}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-teal" : "bg-line")}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={cn("absolute top-1 size-4 rounded-full bg-white shadow", on ? "right-1" : "left-1")} />
      </button>
    </motion.div>
  );
}

/** Wallet transactions (commitment fee and any refund) from the idea this project came from. */
export function WalletPanel({ project }: { project: Project }) {
  const idea = useIdeas().find((i) => i.projectCode === project.code);
  if (!idea?.payments?.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={card}>
      <h4 className="flex items-center gap-2 font-display text-lg font-bold">
        <WalletIcon className="size-5 text-brand" /> Project wallet
      </h4>
      <p className="mb-4 mt-1 text-sm text-muted">Payments linked to {idea.ref}.</p>
      <WalletLedger idea={idea} />
    </motion.div>
  );
}
