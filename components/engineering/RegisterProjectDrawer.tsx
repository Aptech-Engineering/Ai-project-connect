"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, CheckCircle2, Copy, CreditCard, FileText, Link2, Loader2, Search, UploadCloud, X } from "lucide-react";
import { existingClients } from "@/lib/flows";
import { useSiteContent } from "@/lib/content";
import { COUNTRIES, OTHER_COUNTRY, findCountry } from "@/lib/locations";
import { formatBytes, saveFile, validatePdf, type StoredFileMeta } from "@/lib/files";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { feeLabel, feeState, resumeLink, startWalkInApplication } from "@/lib/wallet";
import type { Notify } from "../PortalApp";
import { actingAs } from "./helpers";

const inputClass = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/**
 * Walk-in clients onboard through the platform like everyone else: the admin starts
 * the application, the client gets an emailed link to finish it and fund their wallet.
 */
export default function RegisterProjectDrawer({ open, onClose, onOpenIdeas, notify }: { open: boolean; onClose: () => void; onOpenIdeas: () => void; notify: Notify }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Start a walk-in application"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="font-display text-xl font-bold">Start a walk-in application</h2>
                <p className="text-xs text-muted">We save it as a draft and email the client a link to finish it and pay the {feeLabel()} commitment fee.</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-mist">
                <X className="size-5" />
              </button>
            </div>
            <WalkInForm onDone={onClose} onOpenIdeas={onOpenIdeas} notify={notify} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WalkInForm({ onDone, onOpenIdeas, notify }: { onDone: () => void; onOpenIdeas: () => void; notify: Notify }) {
  const me = useStaff();
  const { ideaForm } = useSiteContent();
  const clients = useMemo(() => existingClients(), []);

  const [search, setSearch] = useState("");
  const [client, setClient] = useState({ name: "", email: "", phone: "", organisation: "", country: "Nigeria", state: "", customCountry: "" });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(ideaForm.categories[0] ?? "");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [brief, setBrief] = useState<StoredFileMeta | undefined>();
  const [uploading, setUploading] = useState(false);
  const [payment, setPayment] = useState<"online" | "centre">("online");
  const [centreNote, setCentreNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Idea | null>(null);

  const setC = (patch: Partial<typeof client>) => setClient((c) => ({ ...c, ...patch }));
  const country = findCountry(client.country);
  const q = search.trim().toLowerCase();
  const matches = q.length < 2 ? [] : clients.filter((c) => [c.name, c.email ?? "", c.organisation ?? ""].some((s) => s.toLowerCase().includes(q))).slice(0, 5);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (client.name.trim().length < 2) next.name = "Enter the client's name.";
    if (!/^\S+@\S+\.\S+$/.test(client.email.trim())) next.email = "The client needs an email to receive their link.";
    if (client.phone.replace(/\D/g, "").length < 10) next.phone = "Enter a phone number for SMS.";
    if (client.country === OTHER_COUNTRY && client.customCountry.trim().length < 2) next.customCountry = "Enter the country.";
    if (!client.state.trim()) next.state = "Choose the state / region.";
    if (title.trim().length < 2) next.title = "Enter a working name for the idea.";
    if (platforms.length === 0) next.platforms = "Pick at least one.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const idea = startWalkInApplication(
      {
        name: client.name.trim(),
        email: client.email.trim(),
        phone: client.phone.trim(),
        organisation: client.organisation.trim() || undefined,
        country: client.country === OTHER_COUNTRY ? client.customCountry.trim() : client.country,
        state: client.state,
        title: title.trim(),
        category,
        platforms,
        budget,
        brief,
        paidAtCentre: payment === "centre" ? { note: centreNote.trim() || "Paid at centre" } : undefined,
      },
      actingAs(me),
    );
    setCreated(idea);
    notify(`Application ${idea.ref} started. Link emailed to ${idea.email}.`);
  };

  if (created) {
    const link = resumeLink(created)!;
    const paid = feeState(created) === "PAID";
    return (
      <div className="flex-1 overflow-y-auto px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-teal" />
        <p className="mt-3 font-display text-2xl font-bold">Application started for {created.name}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          We emailed {created.email} a link to add the idea details{paid ? "" : ` and pay the ${feeLabel()} fee`}. It reaches the inbox once they submit.
        </p>
        <div className="mx-auto mt-5 flex max-w-xs items-center justify-between rounded-2xl bg-mist px-4 py-3">
          <span className="text-left">
            <span className="block text-xs text-muted">Reference</span>
            <span className="font-mono text-lg font-bold">{created.ref}</span>
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", paid ? "bg-teal-soft text-teal-700" : "bg-line text-muted")}>{paid ? "Fee paid" : "Fee unpaid"}</span>
        </div>
        <div className="mx-auto mt-4 flex max-w-xs flex-col gap-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}${link}`).catch(() => {});
              notify("Continue link copied. Only share it with the client.", "info");
            }}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm font-bold"
          >
            <Copy className="size-4" /> Copy client link
          </button>
          <a href={link} target="_blank" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-bold text-muted">
            <Link2 className="size-4" /> Demo: open as client
          </a>
        </div>
        <div className="mx-auto mt-6 flex max-w-xs gap-2">
          <button onClick={onDone} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted">
            Close
          </button>
          <button
            onClick={() => {
              onDone();
              onOpenIdeas();
            }}
            className="h-11 flex-1 rounded-xl bg-navy font-bold text-white"
          >
            View drafts
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden" noValidate>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <section>
          <h3 className="font-display font-bold">Client</h3>
          <div className="mt-3">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-line px-3 focus-within:border-brand">
              <Search className="size-4 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Returning client? Search to fill in their details" aria-label="Search existing clients" className="w-full bg-transparent text-sm outline-none" />
            </div>
            {matches.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {matches.map((c) => (
                  <li key={c.name + c.email}>
                    <button
                      type="button"
                      onClick={() => {
                        setC({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", organisation: c.organisation ?? "" });
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-navy/30"
                    >
                      <span className="truncate font-bold">{c.name}</span>
                      <span className="truncate text-xs text-muted">
                        {c.projects} project{c.projects === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Full name" error={errors.name}>
              <input value={client.name} onChange={(e) => setC({ name: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Organisation (optional)">
              <input value={client.organisation} onChange={(e) => setC({ organisation: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input type="email" value={client.email} onChange={(e) => setC({ email: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <input type="tel" value={client.phone} onChange={(e) => setC({ phone: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Country">
              <select value={client.country} onChange={(e) => setC({ country: e.target.value, state: "" })} className={inputClass}>
                {COUNTRIES.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
                <option value={OTHER_COUNTRY}>Other country</option>
              </select>
            </Field>
            <Field label={country?.regionLabel ?? "State / region"} error={errors.state}>
              {country ? (
                <select value={client.state} onChange={(e) => setC({ state: e.target.value })} className={inputClass}>
                  <option value="">Select</option>
                  {country.regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <input value={client.state} onChange={(e) => setC({ state: e.target.value })} className={inputClass} />
              )}
            </Field>
            {client.country === OTHER_COUNTRY && (
              <Field label="Country name" error={errors.customCountry}>
                <input value={client.customCountry} onChange={(e) => setC({ customCountry: e.target.value })} className={inputClass} />
              </Field>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="font-display font-bold">Idea</h3>
            <p className="text-xs text-muted">Just the basics. The client adds the problem, users and features from their link.</p>
          </div>
          <Field label="Working name" error={errors.title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {ideaForm.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Budget (optional)">
              <select value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                {ideaForm.budgets.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Platforms" error={errors.platforms} group>
            <div className="flex flex-wrap gap-2">
              {ideaForm.platforms.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button key={p} type="button" aria-pressed={on} onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", on ? "border-navy bg-navy text-white" : "border-line text-muted hover:text-navy")}>
                    {p}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Brief or proposal (optional)" group>
            {brief ? (
              <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2.5 text-sm">
                <FileText className="size-4 text-danger" />
                <span className="flex-1 truncate font-bold">{brief.name}</span>
                <span className="text-xs text-muted">{formatBytes(brief.size)}</span>
                <button type="button" onClick={() => setBrief(undefined)} aria-label="Remove file" className="rounded p-1 text-muted hover:text-danger">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-3 text-sm hover:border-brand/40">
                {uploading ? <Loader2 className="size-4 animate-spin text-brand" /> : <UploadCloud className="size-4 text-brand" />}
                <span className="font-bold">Attach PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const problem = await validatePdf(f);
                    if (problem) return setErrors((x) => ({ ...x, brief: problem }));
                    setUploading(true);
                    setBrief(await saveFile(f));
                    setUploading(false);
                  }}
                />
              </label>
            )}
            {errors.brief && <p className="mt-1 text-xs font-bold text-danger">{errors.brief}</p>}
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="font-display font-bold">{feeLabel()} commitment fee</h3>
          <div role="radiogroup" aria-label="Commitment fee" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["online", CreditCard, "Client pays from their link", "Paystack or bank transfer"],
                ["centre", Banknote, "Paid here at the centre", "Recorded as paid now"],
              ] as const
            ).map(([key, Icon, label, hint]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={payment === key}
                onClick={() => setPayment(key)}
                className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", payment === key ? "border-brand bg-brand-soft/40 ring-2 ring-brand/20" : "border-line hover:border-navy/30")}
              >
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", payment === key ? "border-brand bg-brand text-white" : "border-line")}>{payment === key && <Check className="size-3" />}</span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <Icon className="size-4" /> {label}
                  </span>
                  <span className="text-xs text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>
          {payment === "centre" && (
            <Field label="Payment note">
              <input value={centreNote} onChange={(e) => setCentreNote(e.target.value)} placeholder="e.g. Cash received by front desk, Ikeja centre" className={inputClass} />
            </Field>
          )}
        </section>
      </div>
      <div className="flex gap-2 border-t border-line px-6 py-4">
        <button type="button" onClick={onDone} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted">
          Cancel
        </button>
        <button className="h-11 flex-1 rounded-xl bg-brand font-bold text-white hover:bg-brand-600">Start & email link</button>
      </div>
    </form>
  );
}

function Field({ label, error, group, children }: { label: string; error?: string; group?: boolean; children: React.ReactNode }) {
  const Wrap = group ? "div" : "label";
  return (
    <Wrap className="block" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="mb-1 block text-xs font-bold">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-danger">{error}</span>}
    </Wrap>
  );
}
