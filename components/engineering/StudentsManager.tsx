"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  CheckSquare,
  FileSpreadsheet,
  ChevronDown,
  ClipboardList,
  Copy,
  Loader2,
  RotateCw,
  Search,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  createStudent,
  deleteStudent,
  resetClearance,
  setClearance,
  loadStudent,
  updateStudent,
  useStudents,
  type Student,
  type StudentPatch,
} from "@/lib/students";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/format";
import type { Notify } from "../PortalApp";
import StudentImport from "./StudentImport";
import AttendanceBoard from "./AttendanceBoard";

const card = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const input = "h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand";
type Filter = "all" | "cleared" | "not-cleared";

const STANDINGS: { value: "WAIVED" | "BLOCKED"; label: string; hint: string }[] = [
  { value: "WAIVED", label: "Cleared", hint: "Allow this student to enter." },
  { value: "BLOCKED", label: "Not cleared", hint: "Do not allow entry." },
];

/**
 * Student register. Counsellors can onboard students; admins manage records and gate clearance.
 */
export default function StudentsManager({ notify }: { notify: Notify }) {
  const me = useStaff();
  const { data, loading, error, refresh } = useStudents();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"register" | "attendance">("register");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  // Ticked for a bulk clearance. Admins only; nobody else can act on it.
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const students = data?.students ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "cleared" && s.verdict.allowed) ||
        (filter === "not-cleared" && !s.verdict.allowed);
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
          Student records and gate clearance. Each student opens{" "}
          <span className="font-mono text-navy">/student</span> on their phone and shows it at the gate.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {([["register", `Register (${students.length})`], ["attendance", "Attendance"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "cursor-pointer rounded-xl px-3.5 py-2 text-sm font-bold transition",
              tab === key ? "bg-navy text-white" : "bg-mist text-muted hover:text-navy",
            )}
          >
            {key === "attendance" && <ClipboardList className="mr-1.5 inline size-4" />}
            {label}
          </button>
        ))}
      </div>

      {tab === "attendance" ? (
        <AttendanceBoard notify={notify} />
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(stats.total)} />
        <Stat label="Cleared to enter" value={String(stats.cleared)} tone="teal" />
        <Stat label="Not cleared" value={String(stats.owing)} tone={stats.owing > 0 ? "brand" : undefined} />
      </div>

      {me.role === "admin" &&
        (picked.size > 0 ? (
          <BulkBar
            picked={picked}
            onDone={(message) => {
              setPicked(new Set());
              if (message) notify(message);
            }}
            notify={notify}
          />
        ) : (
          <NewMonth cleared={stats.cleared} notify={notify} />
        ))}

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
            ["not-cleared", "Not cleared"],
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
        {me.role === "admin" && shown.length > 0 && (
          <button
            onClick={() => {
              const ids = shown.map((s) => s.id);
              const allPicked = ids.every((id) => picked.has(id));
              setPicked(allPicked ? new Set() : new Set(ids));
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-sm font-bold text-muted hover:text-navy"
          >
            <CheckSquare className="size-4" />
            {shown.every((s) => picked.has(s.id)) ? "Clear the ticks" : `Tick all ${shown.length}`}
          </button>
        )}
        <button
          onClick={() => setImporting(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:border-brand"
        >
          <FileSpreadsheet className="size-4 text-brand" /> Import
        </button>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
        >
          <UserPlus className="size-4" /> Add a student
        </button>
      </div>

      {adding && <AddStudent suggestedId={data.suggestedId} onClose={() => setAdding(false)} onAdded={setOpenId} notify={notify} />}
      {importing && <StudentImport onClose={() => setImporting(false)} notify={notify} />}

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
              picked={picked.has(s.id)}
              onPick={(on) =>
                setPicked((current) => {
                  const next = new Set(current);
                  on ? next.add(s.id) : next.delete(s.id);
                  return next;
                })
              }
              notify={notify}
            />
          ))
        )}
      </div>
        </>
      )}
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

/**
 * What to do with the students that are ticked. It takes the place of the monthly
 * bar while anything is ticked, so the two never sit there competing.
 */
function BulkBar({ picked, onDone, notify }: { picked: Set<number>; onDone: (message?: string) => void; notify: Notify }) {
  const [busy, setBusy] = useState<"WAIVED" | "BLOCKED" | null>(null);
  const n = picked.size;

  const apply = async (standing: "WAIVED" | "BLOCKED") => {
    if (busy) return;
    setBusy(standing);
    try {
      const updated = await setClearance([...picked], standing);
      const wording = standing === "WAIVED" ? "cleared" : "not cleared";
      onDone(`${updated} ${updated === 1 ? "student is" : "students are"} now ${wording}.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-navy bg-navy px-4 py-3 text-white shadow-sm">
      <CheckSquare className="size-4 shrink-0" />
      <p className="text-sm font-bold">
        {n} {n === 1 ? "student" : "students"} ticked
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        <button
          onClick={() => void apply("WAIVED")}
          disabled={busy !== null}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-teal px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy === "WAIVED" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Mark cleared
        </button>
        <button
          onClick={() => void apply("BLOCKED")}
          disabled={busy !== null}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-danger px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy === "BLOCKED" ? <Loader2 className="size-3.5 animate-spin" /> : <TriangleAlert className="size-3.5" />}
          Mark not cleared
        </button>
        <button onClick={() => onDone()} className="cursor-pointer px-2 py-1.5 text-xs font-bold text-white/60 hover:text-white">
          Untick all
        </button>
      </div>
    </div>
  );
}

/**
 * Clearance runs monthly, so there is one button for the turn of the month rather
 * than a trip through every student. It asks first, and says exactly how many it
 * is about to affect.
 */
function NewMonth({ cleared, notify }: { cleared: number; notify: Notify }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (cleared === 0 && !asking) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <CalendarClock className="size-4 shrink-0 text-brand" />
      {asking ? (
        <>
          <p className="text-sm text-navy">
            Set <span className="font-bold">{cleared}</span> cleared {cleared === 1 ? "student" : "students"} back to{" "}
            <span className="font-bold">not cleared</span> for the new month? Clear them again as they pay.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const n = await resetClearance();
                  notify(`New month started. ${n} ${n === 1 ? "student is" : "students are"} now not cleared.`);
                  setAsking(false);
                } catch (e) {
                  notify(errorMessage(e), "info");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Yes, start the new month
            </button>
            <button onClick={() => setAsking(false)} className="cursor-pointer px-2 py-1.5 text-xs font-bold text-muted">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Clearance is monthly. At the turn of the month, put everyone back to not cleared and clear them again as they pay.
          </p>
          <button
            onClick={() => setAsking(true)}
            className="ml-auto cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-navy hover:border-brand"
          >
            Start a new month
          </button>
        </>
      )}
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
    startedOn: "",
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
        startedOn: form.startedOn || null,
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
  picked,
  onPick,
  notify,
}: {
  student: Student;
  open: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  notify: Notify;
}) {
  const chip =
    student.verdict.tone === "green"
      ? "bg-teal-soft text-teal-700"
      : student.verdict.tone === "amber"
        ? "bg-brand-soft text-brand-700"
        : "bg-danger-soft text-danger";

  return (
    <div className={cn("rounded-2xl border bg-white shadow-sm", picked ? "border-navy ring-1 ring-navy/20" : "border-line", !student.active && "opacity-60")}>
      <div className="flex items-center">
        {isAdmin && (
          <label className="cursor-pointer py-4 pl-4 pr-1">
            <input
              type="checkbox"
              checked={picked}
              onChange={(e) => onPick(e.target.checked)}
              aria-label={`Tick ${student.name} for a bulk change`}
              className="size-4 cursor-pointer"
            />
          </label>
        )}
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

        <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", chip)}>{student.verdict.headline}</span>
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} />
      </button>
      </div>

      {open && <StudentDetail student={student} isAdmin={isAdmin} notify={notify} />}
    </div>
  );
}

function StudentDetail({ student, isAdmin, notify }: { student: Student; isAdmin: boolean; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<Student>(student);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [details, setDetails] = useState({
    studentId: student.studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    phone: student.phone ?? "",
    email: student.email ?? "",
    course: student.course ?? "",
    batch: student.batch ?? "",
    gateNote: student.gateNote ?? "",
    note: student.note ?? "",
  });

  // Follow the list whenever the panel refreshes behind the open record.
  useEffect(() => {
    setRow(student);
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
          gateNote: details.gateNote.trim(),
          note: details.note.trim(),
        } satisfies StudentPatch),
      "Record updated. Their phone shows it straight away.",
    );

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

      {/* what the gate should do */}
      <div className="rounded-xl border border-line bg-mist/40 p-4">
        <p className="font-display text-sm font-bold text-navy">At the gate</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {isAdmin && STANDINGS.map((s) => (
            <button
              key={s.value}
              onClick={() => void run(() => updateStudent(student.id, { standing: s.value }), `${student.name}: ${s.label.toLowerCase()}.`)}
              // The filter chips above carry the same words; this says which button it is.
              aria-label={`Mark ${student.name} as ${s.label.toLowerCase()}`}
              aria-pressed={row.standing === s.value}
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
        {!isAdmin && <p className="mt-2 text-xs text-muted">Only an admin can change this clearance status.</p>}

        {isAdmin && <label className="mt-3 block text-xs font-bold text-navy">
          A line for the student and the guard
          <input
            value={details.gateNote}
            onChange={(e) => setDetails({ ...details, gateNote: e.target.value })}
            placeholder="Any note the student or gate staff should see"
            className={cn(input, "mt-1")}
          />
        </label>}
      </div>

      {/* their details */}
      <div className="rounded-xl border border-line bg-mist/40 p-4">
        <p className="font-display text-sm font-bold text-navy">Their details</p>
        {isAdmin ? <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Student ID" value={details.studentId} onChange={(v) => setDetails({ ...details, studentId: v })} mono />
          <Field label="First name" value={details.firstName} onChange={(v) => setDetails({ ...details, firstName: v })} />
          <Field label="Last name" value={details.lastName} onChange={(v) => setDetails({ ...details, lastName: v })} />
          <Field label="Phone" value={details.phone} onChange={(v) => setDetails({ ...details, phone: v })} />
          <Field label="Email" value={details.email} onChange={(v) => setDetails({ ...details, email: v })} />
          <Field label="Course" value={details.course} onChange={(v) => setDetails({ ...details, course: v })} />
          <Field label="Class or batch" value={details.batch} onChange={(v) => setDetails({ ...details, batch: v })} />
        </div> : <p className="mt-2 text-sm text-muted">{row.name} · {row.studentId}{row.phone ? ` · ${row.phone}` : ""}{row.email ? ` · ${row.email}` : ""}</p>}
        {isAdmin && <label className="mt-2 block text-xs font-bold text-navy">
          Internal note <span className="font-sans font-normal text-muted">— staff only, the student never sees it</span>
          <textarea
            value={details.note}
            onChange={(e) => setDetails({ ...details, note: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>}

        {isAdmin && <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  onClick={() => void run(() => deleteStudent(student.id), `${student.name} deleted.`)}
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
        </div>}
        {confirmDelete && <p className="mt-2 text-xs text-danger">This removes the student record. It cannot be undone.</p>}
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
