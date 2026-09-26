"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Download,
  FileText,
  GraduationCap,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  createBatch,
  deleteApplicant,
  deleteBatch,
  saveProgramme,
  updateApplicant,
  updateBatch,
  uploadScholarshipForm,
  useScholarshipAdmin,
  type ScholarshipApplicant,
  type ScholarshipBatch,
} from "@/lib/programmes";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/format";
import type { ScholarshipItem } from "@/lib/scholarship";
import type { Notify } from "../PortalApp";
import { Partners } from "./ScholarshipPartners";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const input = "h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand";
const naira = (n: number) => "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);

type Tab = "applicants" | "batches" | "partners" | "page";

/** Everything about the scholarship programme in one screen. */
export default function ScholarshipManager({ notify }: { notify: Notify }) {
  const me = useStaff();
  const { data, loading, error, refresh } = useScholarshipAdmin();
  const [tab, setTab] = useState<Tab>("applicants");

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
          <p className="text-sm text-muted">Loading the programme…</p>
        )}
      </div>
    );
  }

  const { programme, batches, partners, applicants, stats } = data;
  const isAdmin = me.role === "admin";

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">{programme.title}</h1>
        <p className="text-sm text-muted">
          The public page lives at <span className="font-mono">/scholarship</span>. Applicants pay the form fee, then see their form and exam date.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Applications" value={stats.total} />
        <Stat label="Fees paid" value={stats.paid} hint={naira(stats.collected)} tone="teal" />
        <Stat label="Transfers to confirm" value={stats.awaiting} tone={stats.awaiting > 0 ? "brand" : undefined} />
        <Stat label="Waiting for a batch" value={stats.unassigned} tone={stats.unassigned > 0 ? "brand" : undefined} />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {(
          [
            ["applicants", `Applicants (${applicants.length})`],
            ["batches", `Exam batches (${batches.length})`],
            ["partners", `Partners (${partners.length})`],
            ["page", "Page & form"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("rounded-xl px-3.5 py-2 text-sm font-bold transition", tab === key ? "bg-navy text-white" : "bg-mist text-muted hover:text-navy")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "applicants" && <Applicants applicants={applicants} batches={batches} isAdmin={isAdmin} notify={notify} />}
        {tab === "batches" && <Batches batches={batches} notify={notify} />}
        {tab === "partners" && <Partners partners={partners} isAdmin={isAdmin} notify={notify} />}
        {tab === "page" && <ProgrammeEditor data={data} isAdmin={isAdmin} notify={notify} />}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "teal" | "brand" }) {
  return (
    <div className={card}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", tone === "teal" && "text-teal-700", tone === "brand" && "text-brand-700")}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/* ---------------- applicants ---------------- */

function Applicants({
  applicants,
  batches,
  isAdmin,
  notify,
}: {
  applicants: ScholarshipApplicant[];
  batches: ScholarshipBatch[];
  isAdmin: boolean;
  notify: Notify;
}) {
  const [filter, setFilter] = useState<"all" | "AWAITING_CONFIRMATION" | "PAID" | "PENDING">("all");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = applicants
    .filter((a) => (filter === "all" ? true : a.status === filter))
    .filter((a) => !term || [a.name, a.email, a.phone, a.ref, a.state].some((v) => v.toLowerCase().includes(term)));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["AWAITING_CONFIRMATION", "To confirm"],
            ["PAID", "Paid"],
            ["PENDING", "Not paid"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-bold", filter === key ? "bg-navy text-white" : "bg-mist text-muted hover:text-navy")}
          >
            {label}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or reference" aria-label="Search applicants" className={cn(input, "ml-auto max-w-xs")} />
      </div>

      <ul className="mt-4 space-y-3">
        {list.length === 0 && <li className={cn(card, "text-center text-sm text-muted")}>Nobody here yet.</li>}
        <AnimatePresence initial={false}>
          {list.map((a) => (
            <ApplicantRow key={a.id} applicant={a} batches={batches} isAdmin={isAdmin} notify={notify} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function ApplicantRow({
  applicant: a,
  batches,
  isAdmin,
  notify,
}: {
  applicant: ScholarshipApplicant;
  batches: ScholarshipBatch[];
  isAdmin: boolean;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (message) notify(message, "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const statusChip = {
    PENDING: "bg-mist text-muted",
    AWAITING_CONFIRMATION: "bg-blue-soft text-blue-700",
    PAID: "bg-teal-soft text-teal-700",
    FAILED: "bg-danger-soft text-danger",
  }[a.status];

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn(card, busy && "opacity-70")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-bold">{a.name}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusChip)}>{a.status.replace("_", " ").toLowerCase()}</span>
            <span className="font-mono text-xs text-muted">{a.ref}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            <a href={`mailto:${a.email}`} className="font-medium text-navy hover:text-brand">
              {a.email}
            </a>{" "}
            ·{" "}
            <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-navy hover:text-brand">
              {a.phone}
            </a>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {a.address} · {a.state} · {a.nationality}
            {a.course ? ` · wants ${a.course}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {naira(a.amount)} {a.method === "paystack" ? "online" : a.method === "manual" ? "by transfer" : "unpaid"}
            {a.senderName ? ` · from ${a.senderName}${a.senderBank ? ` (${a.senderBank})` : ""}` : ""}
            {a.reference ? ` · ${a.reference}` : ""}
          </p>
          {a.proofUrl && (
            <a href={a.proofUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-navy hover:border-brand">
              <Download className="size-3.5" /> View receipt
            </a>
          )}
          {a.failureReason && <p className="mt-2 text-xs font-semibold text-danger">{a.failureReason}</p>}
          {a.staffNote && <p className="mt-2 rounded-lg bg-mist px-3 py-2 text-xs text-muted">{a.staffNote}</p>}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
          {a.status === "AWAITING_CONFIRMATION" && (
            <div className="flex gap-2">
              <button
                onClick={() => void run(() => updateApplicant(a.id, { payment: "confirm" }), `${a.name}'s fee confirmed. They have been emailed.`)}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <Check className="size-3.5" /> Confirm fee
              </button>
              <button
                onClick={() => void run(() => updateApplicant(a.id, { payment: "reject", reason: "We could not find this transfer." }), `${a.name} told the transfer was not found.`)}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-navy disabled:opacity-50"
              >
                <X className="size-3.5" /> Reject
              </button>
            </div>
          )}
          {a.status === "PENDING" && isAdmin && (
            <button
              onClick={() => void run(() => updateApplicant(a.id, { payment: "confirm" }), `${a.name} marked as paid at the centre.`)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-bold text-navy disabled:opacity-50"
            >
              <BadgeCheck className="size-3.5" /> Paid at the centre
            </button>
          )}

          <label className="block text-xs font-bold text-navy">
            Exam batch
            <select
              value={a.batchId ?? ""}
              disabled={busy || a.status !== "PAID"}
              onChange={(e) =>
                void run(
                  () => updateApplicant(a.id, { batchId: e.target.value === "" ? null : Number(e.target.value) }),
                  e.target.value === "" ? `${a.name} taken out of their batch.` : `${a.name} placed and emailed the date.`,
                )
              }
              className={cn(input, "mt-1 disabled:bg-mist disabled:text-muted")}
            >
              <option value="">{a.status === "PAID" ? "Not placed yet" : "Place after the fee clears"}</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.examDate ? ` · ${b.examDate}` : ""}
                  {b.capacity ? ` (${b.assigned}/${b.capacity})` : ""}
                </option>
              ))}
            </select>
          </label>

          <input
            defaultValue={a.staffNote ?? ""}
            disabled={busy}
            aria-label={`Internal note for ${a.name}`}
            placeholder="Internal note — only staff see this…"
            onBlur={(e) => e.target.value !== (a.staffNote ?? "") && void run(() => updateApplicant(a.id, { note: e.target.value }))}
            className={cn(input, "text-xs")}
          />

          {isAdmin &&
            (confirmDelete ? (
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-2 text-center">
                <p className="text-[11px] font-bold text-danger">Delete this application?</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => void run(() => deleteApplicant(a.id), `${a.name} removed.`)}
                    aria-label={`Delete ${a.name}'s application permanently`}
                    className="flex-1 rounded-md bg-danger px-2 py-1 text-[11px] font-bold text-white"
                  >
                    Delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-bold text-navy">
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-muted hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-3.5" /> Delete
              </button>
            ))}
        </div>
      </div>
    </motion.li>
  );
}

/* ---------------- batches ---------------- */

function Batches({ batches, notify }: { batches: ScholarshipBatch[]; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; examDate: string; examTime: string; venue: string; capacity: string; notes: string }>({
    name: "",
    examDate: "",
    examTime: "",
    venue: "",
    capacity: "",
    notes: "",
  });

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (message) notify(message, "info");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    await run(
      () =>
        createBatch({
          name: draft.name.trim(),
          examDate: draft.examDate || null,
          examTime: draft.examTime.trim() || null,
          venue: draft.venue.trim() || null,
          capacity: draft.capacity ? Number(draft.capacity) : null,
          notes: draft.notes.trim() || null,
        }),
      `${draft.name.trim()} created.`,
    );
    setDraft({ name: "", examDate: "", examTime: "", venue: "", capacity: "", notes: "" });
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        A batch is an exam sitting: Batch A, Batch B and so on. Place each paid applicant in one, and they are emailed the date and venue.
      </p>

      {batches.map((b) => (
        <div key={b.id} className={cn(card, busy && "opacity-70")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display font-bold">{b.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                <CalendarDays className="mr-1 inline size-4 text-brand" />
                {b.examDate ?? "No date yet"}
                {b.examTime ? ` · ${b.examTime}` : ""}
                {b.venue ? ` · ${b.venue}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                <Users className="mr-1 inline size-3.5" />
                {b.assigned} placed{b.capacity ? ` of ${b.capacity}` : ""}
                {b.notes ? ` · ${b.notes}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void run(() => updateBatch(b.id, { active: !b.active }), b.active ? `${b.name} hidden from the site.` : `${b.name} shown on the site.`)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-navy"
              >
                {b.active ? "Shown" : "Hidden"}
              </button>
              <button
                onClick={() => void run(() => deleteBatch(b.id), `${b.name} deleted. Anyone in it is back to "not placed".`)}
                aria-label={`Delete ${b.name}`}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-4">
            <LabelledInput label="Date" type="date" value={b.examDate ?? ""} onSave={(v) => void run(() => updateBatch(b.id, { examDate: v || null }), `${b.name} updated.`)} />
            <LabelledInput label="Time" value={b.examTime ?? ""} placeholder="10:00 AM" onSave={(v) => void run(() => updateBatch(b.id, { examTime: v || null }), `${b.name} updated.`)} />
            <LabelledInput label="Venue" value={b.venue ?? ""} onSave={(v) => void run(() => updateBatch(b.id, { venue: v || null }), `${b.name} updated.`)} />
            <LabelledInput label="Capacity" type="number" value={b.capacity?.toString() ?? ""} onSave={(v) => void run(() => updateBatch(b.id, { capacity: v ? Number(v) : null }), `${b.name} updated.`)} />
          </div>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className={card}
        >
          <p className="font-display font-bold">New batch</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-navy">
              Name
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Batch A" className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-bold text-navy">
              Exam date
              <input type="date" value={draft.examDate} onChange={(e) => setDraft({ ...draft, examDate: e.target.value })} className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-bold text-navy">
              Time
              <input value={draft.examTime} onChange={(e) => setDraft({ ...draft, examTime: e.target.value })} placeholder="10:00 AM" className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-bold text-navy">
              Capacity
              <input type="number" min={0} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="150" className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-bold text-navy sm:col-span-2">
              Venue
              <input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} placeholder="Aptech Kaduna, Barnawa" className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs font-bold text-navy sm:col-span-2">
              Note for applicants
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Arrive 30 minutes early with a valid ID." className={cn(input, "mt-1")} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={draft.name.trim().length < 1 || busy} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
              {busy ? "Creating…" : "Create batch"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-navy">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:border-brand">
          <Plus className="size-4" /> Add a batch
        </button>
      )}
    </div>
  );
}

function LabelledInput({
  label,
  value,
  onSave,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-xs font-bold text-navy">
      {label}
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
        className={cn(input, "mt-1")}
      />
    </label>
  );
}

/* ---------------- the page itself ---------------- */

function ProgrammeEditor({ data, isAdmin, notify }: { data: ReturnType<typeof useScholarshipAdmin>["data"]; isAdmin: boolean; notify: Notify }) {
  const programme = data!.programme;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: programme.title,
    tagline: programme.tagline ?? "",
    intro: programme.intro ?? "",
    fee: String(programme.fee),
    seats: programme.seats?.toString() ?? "",
    deadline: programme.deadline ?? "",
    formLabel: programme.formLabel,
    active: programme.active,
    closedMessage: programme.closedMessage ?? "",
  });
  const [courses, setCourses] = useState<ScholarshipItem[]>(programme.courses);
  const [uploading, setUploading] = useState(false);

  if (!isAdmin) {
    return (
      <div className={card}>
        <p className="text-sm text-muted">Only an admin can change the page, the fee and the form. You can still manage applicants and batches.</p>
      </div>
    );
  }

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveProgramme({
        title: form.title.trim(),
        tagline: form.tagline.trim(),
        intro: form.intro.trim(),
        fee: Number(form.fee),
        seats: form.seats === "" ? null : Number(form.seats),
        deadline: form.deadline || null,
        formLabel: form.formLabel.trim(),
        active: form.active,
        closedMessage: form.closedMessage.trim(),
        courses: courses.filter((c) => c.title.trim() !== ""),
      });
      notify("Scholarship page updated. It is live now.");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await uploadScholarshipForm(file);
      notify("Form uploaded. Applicants who have paid can download it now.");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="font-display font-bold">
          <FileText className="mr-1.5 inline size-4 text-brand" /> The form applicants download
        </p>
        <p className="mt-1 text-sm text-muted">
          {programme.formUploaded ? (
            <>
              Currently: <span className="font-medium text-navy">{programme.formName}</span>. Uploading a new one replaces it everywhere.
            </>
          ) : (
            "No form uploaded yet. Applicants who pay are told it is coming, and get an email once you add it."
          )}
        </p>
        <label
          htmlFor="scholarship-form-file"
          className={cn("mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line px-4 py-2.5 text-sm font-bold text-navy hover:border-brand", uploading && "opacity-60")}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 text-brand" />}
          {uploading ? "Uploading…" : programme.formUploaded ? "Replace the form" : "Upload the form (PDF or Word)"}
        </label>
        <input
          id="scholarship-form-file"
          type="file"
          accept="application/pdf,.doc,.docx"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <label className="mt-3 block text-xs font-bold text-navy">
          Button wording
          <input value={form.formLabel} onChange={(e) => setForm({ ...form, formLabel: e.target.value })} className={cn(input, "mt-1 max-w-sm")} />
        </label>
      </div>

      <div className={card}>
        <p className="font-display font-bold">
          <GraduationCap className="mr-1.5 inline size-4 text-brand" /> The page
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={cn(input, "mt-1")} />
          </label>
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Tagline
            <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={cn(input, "mt-1")} />
          </label>
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Opening paragraph
            <textarea value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="text-xs font-bold text-navy">
            Form fee (₦)
            <input type="number" min={0} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} className={cn(input, "mt-1")} />
          </label>
          <label className="text-xs font-bold text-navy">
            Total seats
            <input type="number" min={0} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} placeholder="500" className={cn(input, "mt-1")} />
          </label>
          <label className="text-xs font-bold text-navy">
            Deadline
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={cn(input, "mt-1")} />
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs font-bold text-navy">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Applications open
          </label>
          {!form.active && (
            <label className="text-xs font-bold text-navy sm:col-span-2">
              Message when closed
              <input value={form.closedMessage} onChange={(e) => setForm({ ...form, closedMessage: e.target.value })} placeholder="Applications have closed. Follow us for the next round." className={cn(input, "mt-1")} />
            </label>
          )}
        </div>
      </div>

      <div className={card}>
        <p className="font-display font-bold">Courses on the page</p>
        <p className="mt-1 text-sm text-muted">These are the short-term courses an applicant can choose when they register.</p>
        <ul className="mt-3 space-y-2">
          {courses.map((c, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                value={c.title}
                onChange={(e) => setCourses(courses.map((x, n) => (n === i ? { ...x, title: e.target.value } : x)))}
                placeholder="Course name"
                className={input}
              />
              <input
                value={c.description ?? ""}
                onChange={(e) => setCourses(courses.map((x, n) => (n === i ? { ...x, description: e.target.value } : x)))}
                placeholder="One line about it"
                className={input}
              />
              <button onClick={() => setCourses(courses.filter((_, n) => n !== i))} aria-label={`Remove ${c.title || "course"}`} className="rounded-lg px-2 text-muted hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => setCourses([...courses, { title: "", description: "" }])} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-navy hover:border-brand">
          <Plus className="size-3.5" /> Add a course
        </button>
      </div>

      <button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 font-bold text-white disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {busy ? "Saving…" : "Save the page"}
      </button>
    </div>
  );
}
