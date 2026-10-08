"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Plus,
  RotateCw,
  Search,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserPlus,
  Wallet,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  createStudent,
  deleteStudent,
  deleteStudentPayment,
  loadStudent,
  recordStudentPayment,
  updateStudent,
  useStudents,
  type Student,
  type StudentPatch,
} from "@/lib/students";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/format";
import type { Notify } from "../PortalApp";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const input = "h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand";
const naira = (n: number) => "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);

type Filter = "all" | "cleared" | "owing" | "plan" | "blocked";

const STANDINGS: { value: Student["standing"]; label: string; hint: string }[] = [
  { value: "AUTO", label: "The balance decides", hint: "Cleared once the fee is fully paid." },
  { value: "DISCUSSION", label: "Payment discussion ongoing", hint: "Shown as a discussion, not simply unpaid." },
  { value: "BLOCKED", label: "Keep out", hint: "Never cleared, whatever the balance says." },
  { value: "WAIVED", label: "Fees waived", hint: "Always cleared. Nothing to pay." },
];

/**
 * "Students" in the Engineering Panel. The register a counsellor keeps: who is
 * enrolled, what each one owes, and every payment as it comes in. It is the same
 * record the student sees on their phone at the gate.
 */
export default function StudentsManager({ notify }: { notify: Notify }) {
  const me = useStaff();
  const { data, loading, error, refresh } = useStudents();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const students = data?.students ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "cleared" && s.verdict.allowed && s.verdict.state !== "ON_PLAN") ||
        (filter === "owing" && !s.verdict.allowed) ||
        (filter === "plan" && s.standing === "DISCUSSION") ||
        (filter === "blocked" && s.standing === "BLOCKED");
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [s.name, s.studentId, s.phone, s.email, s.course, s.batch].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [students, filter, q]);

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
          <p className="text-sm text-muted">Loading the register…</p>
        )}
      </div>
    );
  }

  const { stats } = data;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">Students</h1>
        <p className="text-sm text-muted">
          Every student, their fee and what they have paid. Each one opens{" "}
          <span className="font-mono text-navy">/student</span> on their phone and shows it at the gate.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(stats.total)} />
        <Stat label="Cleared to enter" value={String(stats.cleared)} tone="teal" />
        <Stat label="Not cleared" value={String(stats.owing)} tone={stats.owing > 0 ? "brand" : undefined} />
        <Stat label="Collected" value={naira(stats.collected)} hint={`${naira(stats.outstanding)} outstanding`} tone="teal" />
      </div>

      <ShareLink page={data.page} notify={notify} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a name, Student ID or phone"
            className={cn(input, "pl-9")}
            aria-label="Search students"
          />
        </label>
        {(
          [
            ["all", `All (${students.length})`],
            ["cleared", "Cleared"],
            ["owing", "Not cleared"],
            ["plan", "On a plan"],
            ["blocked", "Kept out"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "cursor-pointer rounded-xl px-3 py-2 text-sm font-bold transition",
              filter === key ? "bg-navy text-white" : "bg-mist text-muted hover:text-navy",
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setAdding(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
        >
          <UserPlus className="size-4" /> Add a student
        </button>
      </div>

      {adding && <AddStudent suggestedId={data.suggestedId} onClose={() => setAdding(false)} onAdded={setOpenId} notify={notify} />}

      <div className="mt-4 space-y-2">
        {shown.length === 0 ? (
          <div className={card}>
            <p className="text-sm text-muted">
              {students.length === 0 ? "No students on the register yet. Add the first one above." : "Nobody matches that."}
            </p>
          </div>
        ) : (
          shown.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              open={openId === s.id}
              onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              isAdmin={me.role === "admin"}
              notify={notify}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "teal" | "brand" }) {
  return (
    <div className={card}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", tone === "teal" && "text-teal-700", tone === "brand" && "text-brand-700")}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ShareLink({ page, notify }: { page: string; notify: Notify }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <Smartphone className="size-4 shrink-0 text-brand" />
      <p className="text-sm text-muted">
        Students open <span className="font-mono text-navy">{page}</span>, sign in once with their Student ID and name, and save it to their phone.
      </p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(page);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            notify("Copy the address shown.", "info");
          }
        }}
        className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-navy hover:border-brand"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy the link"}
      </button>
    </div>
  );
}

/* ---------------- adding someone ---------------- */

function AddStudent({
  suggestedId,
  onClose,
  onAdded,
  notify,
}: {
  suggestedId: string;
  onClose: () => void;
  onAdded: (id: number) => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    studentId: suggestedId,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    course: "",
    batch: "",
    fee: "",
    startedOn: "",
    dueOn: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.firstName.trim().length > 1 && form.lastName.trim().length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const student = await createStudent({
        studentId: form.studentId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        course: form.course.trim(),
        batch: form.batch.trim(),
        fee: form.fee === "" ? 0 : Number(form.fee),
        startedOn: form.startedOn || null,
        dueOn: form.dueOn || null,
      });
      notify(`${student.name} added — Student ID ${student.studentId}.`);
      onAdded(student.id);
      onClose();
    } catch (err) {
      notify(errorMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn(card, "mt-4")}>
      <p className="font-display font-bold">New student</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-navy">
          Student ID
          <input value={form.studentId} onChange={(e) => set({ studentId: e.target.value })} className={cn(input, "mt-1 font-mono")} />
          <span className="mt-1 block font-sans text-[11px] font-normal text-muted">This is what they type to sign in. Change it if you use your own numbering.</span>
        </label>
        <label className="text-xs font-bold text-navy">
          Course fee (₦)
          <input type="number" min={0} value={form.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="250000" className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          First name
          <input autoFocus value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Last name
          <input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Phone
          <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0803 000 0000" className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Email
          <input value={form.email} onChange={(e) => set({ email: e.target.value })} className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Course
          <input value={form.course} onChange={(e) => set({ course: e.target.value })} placeholder="Web Development" className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Class or batch
          <input value={form.batch} onChange={(e) => set({ batch: e.target.value })} placeholder="Morning · Batch A" className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Started on
          <input type="date" value={form.startedOn} onChange={(e) => set({ startedOn: e.target.value })} className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs font-bold text-navy">
          Balance due by
          <input type="date" value={form.dueOn} onChange={(e) => set({ dueOn: e.target.value })} className={cn(input, "mt-1")} />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button disabled={!valid || busy} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Adding…" : "Add the student"}
        </button>
        <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-bold text-navy">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------------- one student ---------------- */

function StudentRow({
  student,
  open,
  onToggle,
  isAdmin,
  notify,
}: {
  student: Student;
  open: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  notify: Notify;
}) {
  const share = student.fee > 0 ? Math.min(100, Math.round((student.paid / student.fee) * 100)) : 100;
  const chip =
    student.verdict.tone === "green"
      ? "bg-teal-soft text-teal-700"
      : student.verdict.tone === "amber"
        ? "bg-brand-soft text-brand-700"
        : "bg-danger-soft text-danger";

  return (
    <div className={cn("rounded-2xl border border-line bg-white shadow-sm", !student.active && "opacity-60")}>
      <button onClick={onToggle} className="flex w-full cursor-pointer flex-wrap items-center gap-3 p-4 text-left">
        <div className="min-w-[10rem] flex-1">
          <p className="font-display font-bold text-navy">
            {student.name}
            {!student.active && <span className="ml-2 rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">Archived</span>}
          </p>
          <p className="text-xs text-muted">
            <span className="font-mono">{student.studentId}</span>
            {student.course ? ` · ${student.course}` : ""}
            {student.batch ? ` · ${student.batch}` : ""}
          </p>
        </div>

        <div className="min-w-[11rem] flex-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-navy">
              {naira(student.paid)} <span className="font-normal text-muted">of {naira(student.fee)}</span>
            </span>
            {student.outstanding > 0 && <span className="font-bold text-danger">{naira(student.outstanding)} left</span>}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist" role="img" aria-label={`${share}% paid`}>
            <div className={cn("h-full rounded-full", share >= 100 ? "bg-teal" : share > 0 ? "bg-brand" : "bg-line")} style={{ width: `${share}%` }} />
          </div>
        </div>

        <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", chip)}>{student.verdict.headline}</span>
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} />
      </button>

      {open && <StudentDetail student={student} isAdmin={isAdmin} notify={notify} />}
    </div>
  );
}

function StudentDetail({ student, isAdmin, notify }: { student: Student; isAdmin: boolean; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<Student>(student);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payment, setPayment] = useState({ amount: "", method: "cash", reference: "", paidOn: new Date().toISOString().slice(0, 10), note: "" });
  const [details, setDetails] = useState({
    studentId: student.studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    phone: student.phone ?? "",
    email: student.email ?? "",
    course: student.course ?? "",
    batch: student.batch ?? "",
    fee: String(student.fee),
    gateNote: student.gateNote ?? "",
    note: student.note ?? "",
    dueOn: student.dueOn ?? "",
  });

  // The list leaves payments out, so the row fetches the full record when it opens,
  // and follows the list again whenever the panel refreshes behind it.
  useEffect(() => {
    setRow((current) => ({ ...student, payments: current.payments }));
  }, [student]);

  useEffect(() => {
    let live = true;
    void loadStudent(student.id)
      .then((full) => live && setRow(full))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [student.id]);

  const run = async (fn: () => Promise<Student | void>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await fn();
      if (updated) setRow(updated);
      if (message) notify(message);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async () => {
    const amount = Number(payment.amount);
    if (!amount || amount <= 0) return;
    await run(
      () =>
        recordStudentPayment(student.id, {
          amount,
          method: payment.method as "cash",
          reference: payment.reference.trim() || undefined,
          paidOn: payment.paidOn || undefined,
          note: payment.note.trim() || undefined,
        }),
      `${naira(amount)} recorded for ${student.name}.`,
    );
    setPayment({ ...payment, amount: "", reference: "", note: "" });
  };

  const saveDetails = () =>
    run(
      () =>
        updateStudent(student.id, {
          studentId: details.studentId.trim(),
          firstName: details.firstName.trim(),
          lastName: details.lastName.trim(),
          phone: details.phone.trim(),
          email: details.email.trim(),
          course: details.course.trim(),
          batch: details.batch.trim(),
          fee: details.fee === "" ? 0 : Number(details.fee),
          gateNote: details.gateNote.trim(),
          note: details.note.trim(),
          dueOn: details.dueOn || null,
        } satisfies StudentPatch),
      "Record updated. Their phone shows it straight away.",
    );

  const payments = row.payments ?? student.payments ?? [];

  return (
    <div className={cn("space-y-4 border-t border-line p-4", busy && "opacity-70")}>
      {/* What the guard sees, said plainly here too. */}
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-xl p-3 text-sm",
          row.verdict.tone === "green" ? "bg-teal-soft text-teal-700" : row.verdict.tone === "amber" ? "bg-brand-soft text-brand-700" : "bg-danger-soft text-danger",
        )}
      >
        {row.verdict.allowed ? <BadgeCheck className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
        <span>
          <span className="font-bold">{row.verdict.headline}.</span> {row.verdict.detail}
          {row.lastSeenAt && <span className="block text-xs opacity-80">Last opened their pass on {new Date(row.lastSeenAt).toLocaleString("en-GB")}</span>}
        </span>
      </div>

      {/* money in */}
      <div className="rounded-xl border border-line bg-mist/40 p-4">
        <p className="font-display text-sm font-bold text-navy">
          <Wallet className="mr-1.5 inline size-4 text-brand" /> Record a payment
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_8rem_9rem_1fr_auto]">
          <input
            type="number"
            min={1}
            value={payment.amount}
            onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
            placeholder="Amount ₦"
            className={input}
            aria-label="Amount"
          />
          <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} className={input} aria-label="How they paid">
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
            <option value="pos">POS</option>
            <option value="paystack">Paystack</option>
            <option value="other">Other</option>
          </select>
          <input type="date" value={payment.paidOn} onChange={(e) => setPayment({ ...payment, paidOn: e.target.value })} className={input} aria-label="Date paid" />
          <input
            value={payment.reference}
            onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
            placeholder="Teller or reference (optional)"
            className={input}
          />
          <button
            onClick={() => void addPayment()}
            disabled={busy || !payment.amount}
            aria-label="Record the payment"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>

        {payments.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-bold text-navy">{naira(p.amount)}</span>
                <span className="text-xs text-muted">{p.method}</span>
                <span className="text-xs text-muted">{new Date(p.paidOn + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                {p.reference && <span className="font-mono text-xs text-muted">{p.reference}</span>}
                {p.recordedBy && <span className="text-xs text-muted">by {p.recordedBy}</span>}
                <button
                  onClick={() => void run(() => deleteStudentPayment(student.id, p.id!), "Payment removed.")}
                  aria-label={`Remove the payment of ${naira(p.amount)}`}
                  className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* what the gate should do */}
      <div className="rounded-xl border border-line bg-mist/40 p-4">
        <p className="font-display text-sm font-bold text-navy">At the gate</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {STANDINGS.map((s) => (
            <button
              key={s.value}
              onClick={() => void run(() => updateStudent(student.id, { standing: s.value }), `${student.name}: ${s.label.toLowerCase()}.`)}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-left transition",
                row.standing === s.value ? "border-navy bg-white shadow-sm" : "border-line bg-white/60 hover:border-brand",
              )}
            >
              <span className="block text-sm font-bold text-navy">{s.label}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </button>
          ))}
        </div>

        {row.standing === "DISCUSSION" && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-white p-3 text-sm">
            <input
              type="checkbox"
              checked={row.gatePass}
              onChange={(e) => void run(() => updateStudent(student.id, { gatePass: e.target.checked }), e.target.checked ? "They may come in while the plan runs." : "They are not cleared to come in.")}
              className="mt-0.5"
            />
            <span>
              <span className="font-bold text-navy">Let them in while the plan runs</span>
              <span className="block text-xs text-muted">Their pass turns amber and reads &ldquo;Cleared — on a plan&rdquo;, with the balance still shown.</span>
            </span>
          </label>
        )}

        <label className="mt-3 block text-xs font-bold text-navy">
          A line for the student and the guard
          <input
            value={details.gateNote}
            onChange={(e) => setDetails({ ...details, gateNote: e.target.value })}
            placeholder="Paying ₦20,000 on Friday"
            className={cn(input, "mt-1")}
          />
        </label>
      </div>

      {/* their details */}
      <div className="rounded-xl border border-line bg-mist/40 p-4">
        <p className="font-display text-sm font-bold text-navy">Their details</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Student ID" value={details.studentId} onChange={(v) => setDetails({ ...details, studentId: v })} mono />
          <Field label="Course fee (₦)" value={details.fee} onChange={(v) => setDetails({ ...details, fee: v })} type="number" />
          <Field label="First name" value={details.firstName} onChange={(v) => setDetails({ ...details, firstName: v })} />
          <Field label="Last name" value={details.lastName} onChange={(v) => setDetails({ ...details, lastName: v })} />
          <Field label="Phone" value={details.phone} onChange={(v) => setDetails({ ...details, phone: v })} />
          <Field label="Email" value={details.email} onChange={(v) => setDetails({ ...details, email: v })} />
          <Field label="Course" value={details.course} onChange={(v) => setDetails({ ...details, course: v })} />
          <Field label="Class or batch" value={details.batch} onChange={(v) => setDetails({ ...details, batch: v })} />
          <Field label="Balance due by" value={details.dueOn} onChange={(v) => setDetails({ ...details, dueOn: v })} type="date" />
        </div>
        <label className="mt-2 block text-xs font-bold text-navy">
          Internal note <span className="font-sans font-normal text-muted">— staff only, the student never sees it</span>
          <textarea
            value={details.note}
            onChange={(e) => setDetails({ ...details, note: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void saveDetails()}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save
          </button>
          <button
            onClick={() => void run(() => updateStudent(student.id, { active: !row.active }), row.active ? "Archived." : "Back on the register.")}
            className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm font-bold text-navy"
          >
            {row.active ? "Archive" : "Restore"}
          </button>
          {isAdmin &&
            (confirmDelete ? (
              <>
                <button
                  onClick={() => void run(() => deleteStudent(student.id), `${student.name} deleted, with their payment history.`)}
                  className="cursor-pointer rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white"
                >
                  Delete for good
                </button>
                <button onClick={() => setConfirmDelete(false)} className="cursor-pointer px-2 py-2 text-sm font-bold text-muted">
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto cursor-pointer rounded-lg px-3 py-2 text-sm font-bold text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="mr-1.5 inline size-3.5" /> Delete
              </button>
            ))}
        </div>
        {confirmDelete && <p className="mt-2 text-xs text-danger">This removes the student and every payment recorded against them. It cannot be undone.</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="text-xs font-bold text-navy">
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cn(input, "mt-1", mono && "font-mono")} />
    </label>
  );
}
