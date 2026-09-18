"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Wand2,
  X,
} from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import {
  ROLES,
  canViewProject,
  changeOwnPassword,
  createStaffUser,
  generatePassword,
  setStaffPassword,
  updateStaffUser,
  useAllStaffUsers,
  useStaff,
  type StaffRole,
  type StaffUser,
} from "@/lib/staff";
import { cn, formatDate, initials, relativeDay } from "@/lib/format";
import type { Project } from "@/lib/types";
import type { Notify } from "../PortalApp";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

type Filter = StaffRole | "ALL" | "DISABLED";

/** Field messages the server sent back, so a form can show them next to the right input. */
function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError && Object.keys(e.errors).length ? e.errors : {};
}

export default function UsersManager({ notify, projects = [] }: { notify: Notify; projects?: Project[] }) {
  const me = useStaff();
  const { users, loading, error } = useAllStaffUsers();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<StaffUser | "new" | null>(null);
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const activeAdmins = users.filter((u) => u.role === "admin" && u.status === "active").length;
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: users.length, DISABLED: users.filter((u) => u.status === "disabled").length };
    for (const role of Object.keys(ROLES)) c[role] = users.filter((u) => u.role === role && u.status === "active").length;
    return c;
  }, [users]);

  const q = query.trim().toLowerCase();
  const list = users
    .filter((u) => (filter === "ALL" ? true : filter === "DISABLED" ? u.status === "disabled" : u.role === filter && u.status === "active"))
    .filter((u) => !q || [u.name, u.email, u.jobTitle ?? ""].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => Number(a.status === "disabled") - Number(b.status === "disabled") || a.name.localeCompare(b.name));

  /**
   * The same guards the server applies, so we can explain them before the request.
   * The server has the final word and its message is shown if it still refuses.
   */
  const blockReason = (user: StaffUser, next: { role?: StaffRole; status?: StaffUser["status"] }) => {
    const losesAdmin = user.role === "admin" && user.status === "active" && ((next.role && next.role !== "admin") || next.status === "disabled");
    if (losesAdmin && user.id === me.id) return "You can't remove your own admin access.";
    if (losesAdmin && activeAdmins <= 1) return "Keep at least one active admin.";
    return null;
  };

  const toggleStatus = async (user: StaffUser) => {
    const status = user.status === "active" ? "disabled" : "active";
    const reason = blockReason(user, { status });
    if (reason) return notify(reason, "info");
    setBusyId(user.id);
    try {
      await updateStaffUser(user.id, { status });
      notify(status === "disabled" ? `${user.name} can no longer sign in.` : `${user.name} can sign in again.`, status === "disabled" ? "info" : "success");
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Users & roles</h1>
          <p className="mt-1 text-muted">Create staff accounts, choose what each person can do, and disable access when someone leaves.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 self-start rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:bg-brand-600 sm:self-auto">
          <Plus className="size-4" /> Add user
        </button>
      </div>

      {/* role summary */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ROLES) as StaffRole[]).map((role, i) => (
          <motion.button
            key={role}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setFilter(filter === role ? "ALL" : role)}
            className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md", filter === role ? "border-brand ring-4 ring-brand/10" : "border-line")}
          >
            <div className="flex items-center justify-between">
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", ROLES[role].className)}>{ROLES[role].label}</span>
              <span className="font-display text-2xl font-bold">{loading ? "–" : counts[role]}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{ROLES[role].description}</p>
          </motion.button>
        ))}
      </div>

      {/* toolbar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or job title" aria-label="Search users" className="h-full w-full bg-transparent text-sm outline-none" />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {(["ALL", "DISABLED"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-full px-3.5 py-2 text-xs font-bold", filter === f ? "bg-navy text-white" : "bg-white text-muted hover:text-navy")}>
              {f === "ALL" ? "All users" : "Disabled"} <span className="opacity-60">{loading ? "" : counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="hidden grid-cols-[2fr_1.1fr_1fr_0.9fr_auto] gap-4 border-b border-line bg-mist/60 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted lg:grid">
          <span>Person</span>
          <span>Role</span>
          <span>Projects</span>
          <span>Last sign-in</span>
          <span className="w-32 text-right">Actions</span>
        </div>
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {list.map((u) => {
              const assigned = projects.filter((p) => u.role !== "admin" && canViewProject(u, p)).length;
              const disabled = u.status === "disabled";
              const busy = busyId === u.id;
              return (
                <motion.li key={u.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("grid gap-3 px-5 py-4 lg:grid-cols-[2fr_1.1fr_1fr_0.9fr_auto] lg:items-center lg:gap-4", disabled && "bg-mist/50", busy && "opacity-60")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white", disabled ? "bg-muted/50" : u.role === "admin" ? "bg-brand" : "bg-navy")}>{initials(u.name)}</span>
                    <div className="min-w-0">
                      <p className={cn("flex flex-wrap items-center gap-2 font-bold", disabled && "text-muted")}>
                        {u.name}
                        {u.id === me.id && <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold uppercase text-teal-700">You</span>}
                        {disabled && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold uppercase text-danger">Disabled</span>}
                        {u.mustChangePassword && !disabled && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Temp password</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                    </div>
                  </div>
                  <div>
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", ROLES[u.role].className)}>{ROLES[u.role].label}</span>
                    {u.jobTitle && u.jobTitle !== ROLES[u.role].label && <p className="mt-1 text-xs text-muted">{u.jobTitle}</p>}
                  </div>
                  <p className="text-sm text-muted">
                    {u.role === "admin" ? "All projects" : u.role === "counsellor" ? "—" : projects.length ? `${assigned} assigned` : "Set on each project"}
                  </p>
                  <p className="text-sm text-muted">{u.lastLoginAt ? relativeDay(u.lastLoginAt) : "Never"}</p>
                  <div className="flex items-center gap-1 lg:w-32 lg:justify-end">
                    {busy && <Loader2 className="size-4 animate-spin text-brand" />}
                    <IconButton label="Edit" disabled={busy} onClick={() => setEditing(u)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Reset password" disabled={busy} onClick={() => setResetting(u)}>
                      <KeyRound className="size-4" />
                    </IconButton>
                    <IconButton label={disabled ? "Enable account" : "Disable account"} danger={!disabled} disabled={busy} onClick={() => void toggleStatus(u)}>
                      {disabled ? <UserCheck className="size-4" /> : <UserX className="size-4" />}
                    </IconButton>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {loading && (
            <li className="flex items-center justify-center gap-2 py-14 text-sm text-muted" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin text-brand" /> Loading the team…
            </li>
          )}
          {!loading && error && (
            <li className="py-12 text-center" role="alert">
              <AlertTriangle className="mx-auto size-7 text-danger" />
              <p className="mt-2 text-sm font-bold">We couldn&apos;t load the staff accounts.</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-navy">
                Reload the page
              </button>
            </li>
          )}
          {!loading && !error && list.length === 0 && <li className="py-14 text-center text-sm text-muted">No users match.</li>}
        </ul>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" />
        Disabling an account signs that person out immediately and keeps their name on past updates. Project access for leads and engineers comes from the Team section on each project.
      </p>

      <UserDrawer user={editing} onClose={() => setEditing(null)} notify={notify} blockReason={blockReason} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} notify={notify} />
    </div>
  );
}

function UserDrawer({
  user,
  onClose,
  notify,
  blockReason,
}: {
  user: StaffUser | "new" | null;
  onClose: () => void;
  notify: Notify;
  blockReason: (user: StaffUser, next: { role?: StaffRole; status?: StaffUser["status"] }) => string | null;
}) {
  const isNew = user === "new";
  const existing = user && user !== "new" ? user : null;
  return (
    <AnimatePresence>
      {user && (
        <motion.div className="fixed inset-0 z-[70] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={isNew ? "Add user" : "Edit user"}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-display text-xl font-bold">{isNew ? "Add user" : `Edit ${existing?.name}`}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-mist">
                <X className="size-5" />
              </button>
            </div>
            <UserForm key={existing?.id ?? "new"} existing={existing} onDone={onClose} notify={notify} blockReason={blockReason} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UserForm({
  existing,
  onDone,
  notify,
  blockReason,
}: {
  existing: StaffUser | null;
  onDone: () => void;
  notify: Notify;
  blockReason: (user: StaffUser, next: { role?: StaffRole; status?: StaffUser["status"] }) => string | null;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [role, setRole] = useState<StaffRole>(existing?.role ?? "engineer");
  const [jobTitle, setJobTitle] = useState(existing?.jobTitle ?? "");
  const [password, setPassword] = useState(() => (existing ? "" : generatePassword()));
  const [showPassword, setShowPassword] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ user: StaffUser; password: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter the person's full name.";
    if (!existing) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid work email.";
      if (password.length < 10) next.password = "Use at least 10 characters.";
    }
    if (phone && phone.replace(/\D/g, "").length < 7) next.phone = "Enter a valid phone number.";
    if (existing) {
      const reason = blockReason(existing, { role });
      if (reason) next.role = reason;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (existing) {
        await updateStaffUser(existing.id, { name: name.trim(), phone: phone.trim() || null, role, jobTitle: jobTitle.trim() || null });
        notify(`${name.trim()} updated.`);
        onDone();
      } else {
        // The server hashes the password, emails the person and makes them change it.
        const user = await createStaffUser({ name, email, phone, role, jobTitle, password });
        setCreated({ user, password });
        notify(`${user.name} can now sign in.`);
      }
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-teal" />
        <p className="mt-3 font-display text-xl font-bold">{created.user.name} is ready</p>
        <p className="mt-1 text-sm text-muted">Share these sign-in details privately. The password is only shown once; they&apos;ll be asked to change it.</p>
        <CredentialBox email={created.user.email} password={created.password} />
        <button onClick={onDone} className="mt-6 h-11 w-full rounded-xl bg-navy font-bold text-white">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden" noValidate>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <FormField label="Full name" error={errors.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </FormField>
        <FormField label="Work email" error={errors.email} hint={existing ? "Email can't be changed. Create a new user instead." : undefined}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(existing)} className={cn(inputClass, "disabled:bg-mist disabled:text-muted")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone (optional)" error={errors.phone}>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Job title (optional)">
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Back-end engineer" className={inputClass} />
          </FormField>
        </div>

        <FormField label="Role" error={errors.role}>
          <div className="space-y-2" role="radiogroup" aria-label="Role">
            {(Object.keys(ROLES) as StaffRole[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition", role === r ? "border-brand bg-brand-soft/40 ring-2 ring-brand/20" : "border-line hover:border-navy/30")}
              >
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", role === r ? "border-brand" : "border-line")}>
                  {role === r && <span className="size-2.5 rounded-full bg-brand" />}
                </span>
                <span>
                  <span className="block text-sm font-bold">{ROLES[r].label}</span>
                  <span className="block text-xs text-muted">{ROLES[r].description}</span>
                </span>
              </button>
            ))}
          </div>
        </FormField>

        {!existing && (
          <FormField label="Temporary password" error={errors.password} hint="They'll be asked to change it after signing in.">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={cn(inputClass, "pr-10 font-mono")} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-navy">
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <button type="button" onClick={() => setPassword(generatePassword())} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-bold text-muted hover:border-navy/30 hover:text-navy">
                <Wand2 className="size-4" /> Generate
              </button>
            </div>
          </FormField>
        )}

        <p role="status" aria-live="polite" className={cn("text-sm font-bold text-danger", !errors.form && "sr-only")}>
          {busy ? "Saving…" : errors.form ?? ""}
        </p>
      </div>
      <div className="flex gap-2 border-t border-line px-6 py-4">
        <button type="button" onClick={onDone} disabled={busy} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted disabled:opacity-50">
          Cancel
        </button>
        <button disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-navy font-bold text-white hover:bg-navy-700 disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {existing ? "Save changes" : "Create user"}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordDialog({ user, onClose, notify }: { user: StaffUser | null; onClose: () => void; notify: Notify }) {
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    setPassword(null);
    setError("");
    onClose();
  };

  const reset = async () => {
    if (!user || busy) return;
    const next = generatePassword();
    setBusy(true);
    setError("");
    try {
      await setStaffPassword(user.id, next);
      setPassword(next);
      notify(`Password reset for ${user.name}.`, "info");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(user)} onClose={close} title={password ? "New temporary password" : `Reset password for ${user?.name}`}>
      {password && user ? (
        <>
          <p className="text-sm text-muted">Share this privately with {user.name.split(" ")[0]}. It&apos;s only shown once and they&apos;ll be asked to change it.</p>
          <CredentialBox email={user.email} password={password} />
          <button onClick={close} className="mt-5 h-11 w-full rounded-xl bg-navy font-bold text-white">
            Done
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Their current password stops working immediately. You&apos;ll get a temporary password to share with them.</p>
          <p role="status" aria-live="polite" className={cn("mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger", !error && "sr-only")}>
            {busy ? "Resetting…" : error}
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={close} disabled={busy} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => void reset()} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white hover:bg-brand-600 disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />} Reset password
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Any signed-in staff member can change their own password. Forced after a temporary password. */
export function AccountDialog({ open, onClose, notify }: { open: boolean; onClose: () => void; notify: Notify }) {
  const me = useStaff();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const forced = Boolean(me.mustChangePassword);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (next.length < 10) return setError("Your new password must be at least 10 characters.");
    if (next !== confirm) return setError("The new passwords don't match.");
    if (next === current) return setError("Choose a different password from your current one.");
    setBusy(true);
    try {
      // The server checks the current password; nothing is hashed in the browser.
      await changeOwnPassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      notify("Password updated.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={forced ? undefined : onClose} title={forced ? "Choose your own password" : "Change password"}>
      {forced && <p className="mb-4 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-700">You signed in with a temporary password. Set a new one to continue.</p>}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <FormField label={forced ? "Temporary password" : "Current password"}>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} autoComplete="current-password" autoFocus />
        </FormField>
        <FormField label="New password" hint="At least 10 characters.">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm new password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
        </FormField>
        <p role="alert" aria-live="assertive" className={cn("rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger", !error && "sr-only")}>
          {error}
        </p>
        <div className="flex gap-2 pt-2">
          {!forced && (
            <button type="button" onClick={onClose} disabled={busy} className="h-11 flex-1 rounded-xl border border-line font-bold text-muted disabled:opacity-50">
              Cancel
            </button>
          )}
          <button disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-navy font-bold text-white disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Update password
          </button>
        </div>
      </form>
      <p className="mt-4 text-xs text-muted">
        Signed in as {me.email} · {ROLES[me.role].label}
        {me.lastLoginAt ? ` · last sign-in ${formatDate(me.lastLoginAt)}` : ""}
      </p>
    </Modal>
  );
}

/* ---------------- shared ---------------- */

function CredentialBox({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-line bg-mist p-4 text-left text-sm">
      <p className="text-xs text-muted">Email</p>
      <p className="font-bold">{email}</p>
      <p className="mt-2 text-xs text-muted">Temporary password</p>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-base font-bold">{password}</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`${email}\n${password}`).catch(() => {});
            setCopied(true);
          }}
          className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-sm"
        >
          {copied ? <CheckCircle2 className="size-3.5 text-teal" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-bold text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function IconButton({ label, onClick, children, danger, disabled }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("rounded-lg p-2 text-muted transition disabled:opacity-40", danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-mist hover:text-navy")}
    >
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose?: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.97 }} className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-bold">{title}</h2>
              {onClose && (
                <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-mist">
                  <X className="size-5" />
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
