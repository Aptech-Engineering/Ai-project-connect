"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Eye, Handshake, Image as ImageIcon, Loader2, Plus, Trash2, Users } from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  createPartner,
  deletePartner,
  updatePartner,
  uploadPartnerLogo,
  type PartnerPatch,
  type PartnerRow,
  type ScholarshipPartner,
} from "@/lib/programmes";
import { cn } from "@/lib/format";
import type { Notify } from "../PortalApp";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const input = "h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand";
const area = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand";

/** ghessa — what the address will read as, before it is saved. */
const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

/**
 * "Partners" in the scholarship screen. An organisation that would rather not touch
 * its own website gets a co-branded page on ours instead, at
 * /scholarship/partner/<slug>, and Register sends people straight to /scholarship.
 */
export function Partners({ partners, isAdmin, notify }: { partners: ScholarshipPartner[]; isAdmin: boolean; notify: Notify }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  if (!isAdmin) {
    return (
      <div className={card}>
        <p className="text-sm text-muted">Only an admin can add or change partner pages.</p>
      </div>
    );
  }

  const add = async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    try {
      const partner = await createPartner({ name: name.trim() });
      notify(`${partner.name}'s page is live at ${partner.url}`);
      setName("");
      setAdding(false);
      setOpenId(partner.id);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <p className="font-display font-bold">
          <Handshake className="mr-1.5 inline size-4 text-brand" /> Partner landing pages, hosted here
        </p>
        <p className="mt-1 text-sm text-muted">
          Add an organisation and they get their own co-branded page on our domain — <span className="font-mono">/scholarship/partner/their-name</span> —
          carrying their logo, their wording and the live fee, seats and deadline. Send them the link; nothing has to change on their website. Everyone who
          registers from their page is counted against them.
        </p>
      </div>

      {partners.map((p) => (
        <PartnerCard key={p.id} partner={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} notify={notify} />
      ))}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className={card}
        >
          <p className="font-display font-bold">New partner</p>
          <label className="mt-3 block text-xs font-bold text-navy">
            Their name
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="GHESSA" className={cn(input, "mt-1 max-w-sm")} />
          </label>
          <p className="mt-1.5 text-xs text-muted">
            Their page will be at <span className="font-mono text-navy">/scholarship/partner/{toSlug(name) || "…"}</span>. You can change the wording, the
            colour and the logo once it exists.
          </p>
          <div className="mt-3 flex gap-2">
            <button disabled={busy || name.trim().length < 2} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
              {busy ? "Creating…" : "Create the page"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-navy">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:border-brand"
        >
          <Plus className="size-4" /> Add a partner
        </button>
      )}
    </div>
  );
}

function PartnerCard({
  partner,
  open,
  onToggle,
  notify,
}: {
  partner: ScholarshipPartner;
  open: boolean;
  onToggle: () => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (message) notify(message);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partner.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify("Copy the link from the address shown.", "info");
    }
  };

  return (
    <div className={cn(card, busy && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {partner.logo ? (
            <img src={partner.logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
          ) : (
            <span className="grid size-10 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: partner.accent }}>
              {partner.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="font-display font-bold">
              {partner.name}
              {!partner.active && <span className="ml-2 rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">Hidden</span>}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-muted">{partner.url}</span>
              <button onClick={() => void copy()} className="inline-flex cursor-pointer items-center gap-1 font-bold text-brand-700 hover:underline">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={partner.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 font-bold text-brand-700 hover:underline"
              >
                <ExternalLink className="size-3.5" /> Open
              </a>
            </div>
            <p className="mt-1 text-xs text-muted">
              <Eye className="mr-1 inline size-3.5" />
              {partner.views} {partner.views === 1 ? "view" : "views"}
              <span className="mx-1.5">·</span>
              <Users className="mr-1 inline size-3.5" />
              {partner.applicants} registered from this page
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void run(() => updatePartner(partner.id, { active: !partner.active }), partner.active ? `${partner.name}'s page is hidden.` : `${partner.name}'s page is live.`)}
            className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-navy"
          >
            {partner.active ? "Live" : "Hidden"}
          </button>
          <button onClick={onToggle} className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-navy">
            {open ? "Close" : "Edit the page"}
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={() => void run(() => deletePartner(partner.id), `${partner.name}'s page deleted.`)}
                className="cursor-pointer rounded-lg bg-danger px-2.5 py-1.5 text-xs font-bold text-white"
              >
                Delete for good
              </button>
              <button onClick={() => setConfirmDelete(false)} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-bold text-muted">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${partner.name}'s partner page`}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && <PartnerEditor partner={partner} notify={notify} />}
    </div>
  );
}

function PartnerEditor({ partner, notify }: { partner: ScholarshipPartner; notify: Notify }) {
  const c = partner.content ?? {};
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: partner.name,
    slug: partner.slug,
    fullName: partner.fullName ?? "",
    accent: /^#[0-9a-f]{6}$/i.test(partner.accent) ? partner.accent : "#0a7a3c",
    website: partner.website ?? "",
    email: partner.email ?? "",
    phone: partner.phone ?? "",
    programmeTitle: partner.programmeTitle ?? "",
    tagline: partner.tagline ?? "",
    intro: partner.intro ?? "",
    tracksNote: c.tracksNote ?? "",
    pathwayIntro: c.pathwayIntro ?? "",
    partnerWhy: c.partnerWhy ?? "",
    aptechWhy: c.aptechWhy ?? "",
    apcWhy: c.apcWhy ?? "",
  });
  const [objectives, setObjectives] = useState<PartnerRow[]>(c.objectives ?? []);
  const [tracks, setTracks] = useState<PartnerRow[]>(c.tracks ?? []);
  const [pathwaySteps, setPathwaySteps] = useState<string[]>(c.pathwaySteps ?? []);
  const [pathwayDetails, setPathwayDetails] = useState<PartnerRow[]>(c.pathwayDetails ?? []);
  const [eligibility, setEligibility] = useState<PartnerRow[]>(c.eligibility ?? []);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const patch: PartnerPatch = {
        ...form,
        slug: toSlug(form.slug) || partner.slug,
        objectives: objectives.filter((o) => (o.title ?? "").trim() !== ""),
        tracks: tracks.filter((t) => (t.track ?? "").trim() !== ""),
        pathwaySteps: pathwaySteps.map((s) => s.trim()).filter(Boolean),
        pathwayDetails: pathwayDetails.filter((d) => (d.title ?? "").trim() !== ""),
        eligibility: eligibility.filter((e) => (e.title ?? "").trim() !== ""),
      };
      const saved = await updatePartner(partner.id, patch);
      notify(saved.slug === partner.slug ? `${saved.name}'s page updated.` : `Saved. Their page has moved to ${saved.url}`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await uploadPartnerLogo(partner.id, file);
      notify("Logo updated.");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <Section title="Who they are">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="Name" value={form.name} onChange={(v) => set({ name: v })} placeholder="GHESSA" />
          <label className="text-xs font-bold text-navy">
            Page address
            <div className="mt-1 flex items-center gap-1.5">
              <span className="whitespace-nowrap text-xs text-muted">/scholarship/partner/</span>
              <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className={input} />
            </div>
          </label>
          <Text label="Full name" value={form.fullName} onChange={(v) => set({ fullName: v })} placeholder="Grassroot Humanitarian Empowerment Support" wide />
          <Text label="Their website" value={form.website} onChange={(v) => set({ website: v })} placeholder="ghessa.com.ng" />
          <Text label="Their email" value={form.email} onChange={(v) => set({ email: v })} placeholder="info@ghessa.com.ng" />
          <Text label="Their phone" value={form.phone} onChange={(v) => set({ phone: v })} placeholder="0803 000 0000" />
          <label className="text-xs font-bold text-navy">
            Their colour
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={form.accent} onChange={(e) => set({ accent: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-line" />
              <input value={form.accent} onChange={(e) => set({ accent: e.target.value })} className={input} />
            </div>
          </label>
        </div>

        <label
          htmlFor={`partner-logo-${partner.id}`}
          className={cn(
            "mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-4 py-2.5 text-sm font-bold text-navy hover:border-brand",
            uploading && "opacity-60",
          )}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4 text-brand" />}
          {uploading ? "Uploading…" : partner.logo ? "Replace their logo" : "Upload their logo (PNG with a clear background)"}
        </label>
        <input
          id={`partner-logo-${partner.id}`}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </Section>

      <Section title="The hero" hint="Anything left empty falls back to what the main scholarship page says.">
        <div className="grid gap-3">
          <Text label="Programme title" value={form.programmeTitle} onChange={(v) => set({ programmeTitle: v })} placeholder="Nigeria 66th Independence Month Scholarship Program" wide />
          <Text label="Tagline" value={form.tagline} onChange={(v) => set({ tagline: v })} wide />
          <Area label="Opening paragraph" value={form.intro} onChange={(v) => set({ intro: v })} rows={3} />
        </div>
      </Section>

      <Section title="Core objectives">
        <RowEditor rows={objectives} setRows={setObjectives} fields={["title", "description"]} addLabel="Add an objective" />
      </Section>

      <Section title="Course tracks">
        <RowEditor rows={tracks} setRows={setTracks} fields={["track", "focus", "target"]} addLabel="Add a track" />
        <Area label="Note under the table" value={form.tracksNote} onChange={(v) => set({ tracksNote: v })} rows={2} />
      </Section>

      <Section title="Academic pathway">
        <Area label="Introduction" value={form.pathwayIntro} onChange={(v) => set({ pathwayIntro: v })} rows={2} />
        <label className="mt-3 block text-xs font-bold text-navy">
          The stages, in order
          <input
            value={pathwaySteps.join(" → ")}
            onChange={(e) => setPathwaySteps(e.target.value.split(/→|>|,/).map((s) => s.trim()))}
            placeholder="Short-term course → Foundation certificate → Advanced Diploma (ADSE) → HND / B.Sc."
            className={cn(input, "mt-1")}
          />
        </label>
        <p className="mt-1 text-xs text-muted">Separate the stages with an arrow or a comma.</p>
        <div className="mt-3">
          <RowEditor rows={pathwayDetails} setRows={setPathwayDetails} fields={["title", "description"]} addLabel="Add a stage explanation" />
        </div>
      </Section>

      <Section title="Eligibility & how to apply">
        <RowEditor rows={eligibility} setRows={setEligibility} fields={["title", "description"]} addLabel="Add a card" />
      </Section>

      <Section title="Who is behind this">
        <div className="grid gap-3">
          <Area label={`About ${form.name || "the partner"}`} value={form.partnerWhy} onChange={(v) => set({ partnerWhy: v })} rows={2} />
          <Area label="About APTECH" value={form.aptechWhy} onChange={(v) => set({ aptechWhy: v })} rows={2} />
          <Area label="About AI Projects LTD" value={form.apcWhy} onChange={(v) => set({ apcWhy: v })} rows={2} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void save()} disabled={busy} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 py-2.5 font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {busy ? "Saving…" : "Save their page"}
        </button>
        <a href={partner.url} target="_blank" rel="noreferrer" className="cursor-pointer text-sm font-bold text-brand-700 hover:underline">
          Preview it
        </a>
      </div>
    </div>
  );
}

/* ---------------- small pieces ---------------- */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-mist/40 p-4">
      <p className="font-display text-sm font-bold text-navy">{title}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={cn("text-xs font-bold text-navy", wide && "sm:col-span-2")}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(input, "mt-1")} />
    </label>
  );
}

function Area({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="mt-3 block text-xs font-bold text-navy first:mt-0">
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={cn(area, "mt-1")} />
    </label>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "Heading",
  description: "What it says",
  track: "Course track",
  focus: "Core focus areas",
  target: "Skill target",
};

/** One list on the page: add, edit and remove its rows. */
function RowEditor({
  rows,
  setRows,
  fields,
  addLabel,
}: {
  rows: PartnerRow[];
  setRows: (rows: PartnerRow[]) => void;
  fields: (keyof PartnerRow)[];
  addLabel: string;
}) {
  const edit = (i: number, key: keyof PartnerRow, value: string) => setRows(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)));

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className={cn("grid gap-2", fields.length === 3 ? "sm:grid-cols-[1fr_1.4fr_1.4fr_auto]" : "sm:grid-cols-[1fr_2fr_auto]")}>
            {fields.map((f) => (
              <input key={f} value={row[f] ?? ""} onChange={(e) => edit(i, f, e.target.value)} placeholder={FIELD_LABELS[f] ?? f} className={input} />
            ))}
            <button
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
              aria-label={`Remove ${row.title || row.track || "row"}`}
              className="cursor-pointer rounded-lg px-2 text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setRows([...rows, {}])}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-navy hover:border-brand"
      >
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </>
  );
}
