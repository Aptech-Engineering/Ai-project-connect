"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, CheckCircle2, Copy, CreditCard, FileText, Loader2, Mail, Search, UploadCloud, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useSiteContent } from "@/lib/content";
import { formatPrice } from "@/lib/catalog";
import { usePaymentSettings } from "@/lib/settings";
import { useStaffClients } from "@/lib/store";
import { COUNTRIES, OTHER_COUNTRY, findCountry } from "@/lib/locations";
import { formatBytes, validatePdf } from "@/lib/files";
import { cn } from "@/lib/format";
import type { Idea } from "@/lib/ideas";
import { recordCentrePayment, startWalkInApplication } from "@/lib/wallet";
import type { Notify } from "../PortalApp";

const inputClass = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

/**
 * Walk-in clients onboard through the platform like everyone else: the admin starts
 * the application, the server emails the client a private link to finish it and fund
 * their wallet. We never see that link again once it's sent.
 */
export default function RegisterProjectDrawer({ open, onClose, onOpenIdeas, notify }: { open: boolean; onClose: () => void; onOpenIdeas: () => void; notify: Notify }) {
  const settings = usePaymentSettings();
  const fee = formatPrice(settings.commitmentFee, settings.currency);
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
                <p className="text-xs text-muted">We save it as a draft and email the client a link to finish it and pay the {fee} commitment fee.</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-mist">
                <X className="size-5" />
              </button>
            </div>
            <WalkInForm fee={fee} onDone={onClose} onOpenIdeas={onOpenIdeas} notify={notify} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Created = { idea: Idea; sentTo: string; devLink?: string; paidAtCentre: boolean };

function WalkInForm({ fee, onDone, onOpenIdeas, notify }: { fee: string; onDone: () => void; onOpenIdeas: () => void; notify: Notify }) {
  const { ideaForm } = useSiteContent();

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const { clients, loading: searching } = useStaffClients(q);

  const [client, setClient] = useState({ name: "", email: "", phone: "", organisation: "", country: "Nigeria", state: "", customCountry: "" });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(ideaForm.categories[0] ?? "");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [brief, setBrief] = useState<File | undefined>();
  const [payment, setPayment] = useState<"online" | "centre">("online");
  const [centreNote, setCentreNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  // The client list comes from the server, so wait until they stop typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const setC = (patch: Partial<typeof client>) => setClient((c) => ({ ...c, ...patch }));
  const country = findCountry(client.country);
  const matches = clients.slice(0, 5);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (client.name.trim().length < 2) next.name = "Enter the client's name.";
    if (!/^\S+@\S+\.\S+$/.test(client.email.trim())) next.email = "The client needs an email to receive their link.";
    if (client.phone && client.phone.replace(/\D/g, "").length < 10) next.phone = "Enter a phone number we can text.";
    if (client.country === OTHER_COUNTRY && client.customCountry.trim().length < 2) next.customCountry = "Enter the country.";
    if (title.trim().length < 2) next.title = "Enter a working name for the idea.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setStatus("Starting the application…");
    try {
      const result = await startWalkInApplication({
        name: client.name.trim(),
        email: client.email.trim(),
        phone: client.phone.trim() || undefined,
        organisation: client.organisation.trim() || undefined,
        country: client.country === OTHER_COUNTRY ? client.customCountry.trim() : client.country,
        state: client.state || undefined,
        title: title.trim(),
        category,
        platforms: platforms.length ? platforms : undefined,
        budget: budget || undefined,
        attachment: brief,
      });

      let paidAtCentre = false;
      if (payment === "centre") {
        setStatus("Recording the payment taken at the centre…");
        try {
          await recordCentrePayment(result.idea.id, { senderName: client.name.trim(), note: centreNote.trim() || "Paid at the centre" });
          paidAtCentre = true;
        } catch (err) {
          // The application exists either way, so say what happened and carry on.
          notify(`Application started, but the payment wasn't recorded: ${errorMessage(err)}`, "info");
        }
      }

      setCreated({ idea: result.idea, sentTo: result.sentTo, devLink: result.devLink, paidAtCentre });
      notify(`Application ${result.idea.ref} started. Link emailed to ${result.sentTo}.`);
      setStatus("");
    } catch (err) {
      const message = errorMessage(err);
      setStatus(message);
      notify(message, "info");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-teal" />
        <p className="mt-3 font-display text-2xl font-bold">Application started for {created.idea.name ?? client.name}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          We emailed {created.sentTo} a private link to add the idea details{created.paidAtCentre ? "" : ` and pay the ${fee} fee`}. It reaches the inbox once they submit it.
        </p>
        <div className="mx-auto mt-5 flex max-w-xs items-center justify-between rounded-2xl bg-mist px-4 py-3">
          <span className="text-left">
            <span className="block text-xs text-muted">Reference</span>
            <span className="font-mono text-lg font-bold">{created.idea.ref}</span>
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", created.paidAtCentre ? "bg-teal-soft text-teal-700" : "bg-line text-muted")}>
            {created.paidAtCentre ? "Fee paid" : "Fee unpaid"}
          </span>
        </div>

        <p className="mx-auto mt-4 flex max-w-xs items-start gap-2 rounded-xl bg-blue-soft px-3 py-2.5 text-left text-xs text-navy/80">
          <Mail className="mt-0.5 size-4 shrink-0" />
          The link is private to the client, so we can&apos;t show it here. If it doesn&apos;t arrive, open the draft in the ideas inbox and email it again.
        </p>

        {created.devLink && (
          <div className="mx-auto mt-4 max-w-xs rounded-xl border border-brand/30 bg-brand-soft/40 p-3 text-left">
            <p className="text-xs font-bold">Client link (test server only)</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 font-mono text-[11px]">{created.devLink}</code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(created.devLink ?? "").catch(() => {});
                  notify("Continue link copied. Only share it with the client.", "info");
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] font-bold hover:border-navy"
              >
                <Copy className="size-3" /> Copy
              </button>
            </div>
          </div>
        )}

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
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Returning client? Search to fill in their details"
                aria-label="Search existing clients"
                className="w-full bg-transparent text-sm outline-none"
              />
              {searching && <Loader2 className="size-4 shrink-0 animate-spin text-brand" />}
            </div>
            {matches.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setC({
                          name: c.name,
                          email: c.email ?? "",
                          phone: c.phone ?? "",
                          organisation: c.organisation ?? "",
                          country: c.country ?? "Nigeria",
                          state: c.state ?? "",
                        });
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
            <Field label="Phone (optional)" error={errors.phone}>
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
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                    className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", on ? "border-navy bg-navy text-white" : "border-line text-muted hover:text-navy")}
                  >
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
                <UploadCloud className="size-4 text-brand" />
                <span className="font-bold">Attach PDF</span>
                <span className="text-xs text-muted">(uploaded when you start the application)</span>
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
                    setErrors((x) => ({ ...x, brief: "" }));
                    setBrief(f);
                  }}
                />
              </label>
            )}
            {errors.brief && <p className="mt-1 text-xs font-bold text-danger">{errors.brief}</p>}
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="font-display font-bold">{fee} commitment fee</h3>
          <div role="radiogroup" aria-label="Commitment fee" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["online", CreditCard, "Client pays from their link", "Paystack or bank transfer"],
                ["centre", Banknote, "Paid here at the centre", "Recorded and confirmed now"],
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
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", payment === key ? "border-brand bg-brand text-white" : "border-line")}>
                  {payment === key && <Check className="size-3" />}
                </span>
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

        <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-sm text-muted", !status && "sr-only")}>
          {busy && <Loader2 className="size-4 animate-spin text-brand" />}
          {status}
        </p>
      </div>

      <div className="flex gap-2 border-t border-line px-6 py-4">
        <button type="button" onClick={onDone} disabled={busy} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted disabled:opacity-50">
          Cancel
        </button>
        <button disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white hover:bg-brand-600 disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />} {busy ? "Starting…" : "Start & email link"}
        </button>
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
