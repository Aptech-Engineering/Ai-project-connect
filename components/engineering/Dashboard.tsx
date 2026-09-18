"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  Clock,
  FolderKanban,
  Inbox,
  BarChart3,
  History,
  UserPlus,
  KeyRound,
  UsersRound,
  Globe,
  BellRing,
  GraduationCap,
  Loader2,
  MessageCircle,
  Lightbulb,
  LayoutList,
  LogOut,
  Menu,
  RotateCw,
  Search,
  SquareKanban,
  X,
  Zap,
} from "lucide-react";
import StageBadge from "../status/StageBadge";
import ProjectWorkspace from "./ProjectWorkspace";
import IdeasInbox from "./IdeasInbox";
import { STAGES, STALE_DAYS } from "@/lib/data";
import { refreshProjects, useApprovals, useDashboard, useStaffProjects, type DashboardSummary, type PendingUpdate, type ProjectSummary } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { approveUpdate, changeStage, deleteUpdate } from "@/lib/actions";
import { LeadsQueue, MessagesInbox, Outbox } from "./Queues";
import { cn, initials, relativeDay } from "@/lib/format";
import type { StageKey } from "@/lib/types";
import type { Notify } from "../PortalApp";
import { canLead, canLeadSummary } from "./helpers";
import UsersManager, { AccountDialog } from "./UsersManager";
import Reports from "./Reports";
import ActivityLogView from "./ActivityLogView";
import RegisterProjectDrawer from "./RegisterProjectDrawer";
import PaymentsView from "./PaymentsView";
import SettingsScreen from "./SettingsScreen";
import { SlidersHorizontal } from "lucide-react";
import { Wallet as WalletIcon } from "lucide-react";
import { ROLES, useStaff } from "@/lib/staff";
import ContentManager from "./cms/ContentManager";

type View = "projects" | "approvals" | "ideas" | "messages" | "leads" | "outbox" | "website" | "users" | "reports" | "activity" | "payments" | "settings";

const BOARD: StageKey[] = ["UNDER_REVIEW", "DESIGN", "DEVELOPMENT", "TESTING", "DEPLOYMENT", "DELIVERED", "ON_HOLD"];

export default function Dashboard({ onSignOut, notify }: { onSignOut: () => void; notify: Notify }) {
  const me = useStaff();
  const isTeam = me.role !== "counsellor";
  const [view, setView] = useState<View>(isTeam ? "projects" : "leads");
  const [accountOpen, setAccountOpen] = useState(Boolean(me.mustChangePassword));
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageKey | "ALL">("ALL");
  const [menuOpen, setMenuOpen] = useState(false);
  // `n` forces the inbox to remount so it picks up a new filter or selection.
  const [ideaFocus, setIdeaFocus] = useState<{ filter?: "DRAFT"; id?: number; n: number }>({ n: 0 });

  // The server counts everything this role is allowed to see.
  const { data: summary } = useDashboard();
  const totalProjects = summary ? summary.activeProjects + summary.deliveredProjects : null;
  const paymentTasks = (summary?.paymentsToConfirm ?? 0) + (summary?.refundsPending ?? 0);

  const go = (v: View) => {
    setView(v);
    setSelected(null);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {isTeam && (
      <>
      <NavItem active={view === "projects" && !selected} onClick={() => go("projects")} icon={<FolderKanban className="size-5" />}>
        Projects
        {totalProjects !== null && <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs">{totalProjects}</span>}
      </NavItem>
      {canLead(me.role) && (
        <NavItem active={view === "ideas" && !selected} onClick={() => go("ideas")} icon={<Lightbulb className="size-5" />}>
          Ideas
          {(summary?.newIdeas ?? 0) > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{summary?.newIdeas} new</span>}
        </NavItem>
      )}
      <NavItem active={view === "approvals" && !selected} onClick={() => go("approvals")} icon={<Inbox className="size-5" />}>
        Approvals
        {(summary?.pendingApprovals ?? 0) > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{summary?.pendingApprovals}</span>}
      </NavItem>
      <NavItem active={view === "messages" && !selected} onClick={() => go("messages")} icon={<MessageCircle className="size-5" />}>
        Client messages
        {(summary?.needsReply ?? 0) > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{summary?.needsReply}</span>}
      </NavItem>
      </>
      )}
      {(me.role === "admin" || me.role === "counsellor") && (
      <NavItem active={view === "leads" && !selected} onClick={() => go("leads")} icon={<GraduationCap className="size-5" />}>
        Course leads
        {(summary?.newLeads ?? 0) > 0 && <span className="ml-auto rounded-full bg-teal px-2 py-0.5 text-xs font-bold text-white">{summary?.newLeads} new</span>}
      </NavItem>
      )}
      {me.role === "admin" && (
        <>
          <NavItem active={view === "outbox" && !selected} onClick={() => go("outbox")} icon={<BellRing className="size-5" />}>
            Notifications
          </NavItem>
          <p className="mt-4 px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-white/40">Admin</p>
          <NavItem active={view === "reports" && !selected} onClick={() => go("reports")} icon={<BarChart3 className="size-5" />}>
            Reports
          </NavItem>
          <NavItem active={view === "payments" && !selected} onClick={() => go("payments")} icon={<WalletIcon className="size-5" />}>
            Payments
            {paymentTasks > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{paymentTasks}</span>}
          </NavItem>
          <NavItem active={view === "settings" && !selected} onClick={() => go("settings")} icon={<SlidersHorizontal className="size-5" />}>
            Settings
          </NavItem>
          <NavItem active={view === "activity" && !selected} onClick={() => go("activity")} icon={<History className="size-5" />}>
            Activity log
          </NavItem>
          <NavItem active={view === "website" && !selected} onClick={() => go("website")} icon={<Globe className="size-5" />}>
            Website content
          </NavItem>
          <NavItem active={view === "users" && !selected} onClick={() => go("users")} icon={<UsersRound className="size-5" />}>
            Users & roles
          </NavItem>
        </>
      )}
      <Link href="/" target="_blank" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/5 hover:text-white">
        <ArrowUpRight className="size-5" /> Open client portal
      </Link>
    </nav>
  );

  const account = (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-bold text-white">
          {me.name
            .split(/\s+/)
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{me.name}</p>
          <p className="truncate text-xs text-white/50">{me.email}</p>
          <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">{ROLES[me.role].label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setAccountOpen(true)} className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white">
          <KeyRound className="size-4" /> Password
        </button>
        <button onClick={onSignOut} className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-mist">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden bg-navy p-4 lg:flex">
        <svg aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 size-96 opacity-60" viewBox="0 0 400 400" fill="none">
          {[50, 90, 130, 170].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} stroke="rgba(160,190,230,0.12)" />
          ))}
        </svg>
        <SidebarBrand />
        <div className="relative mt-8 flex-1">{nav}</div>
        <div className="relative">{account}</div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 bg-navy lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <SidebarBrand />
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen} className="rounded-lg p-2 text-white">
            {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-white/10">
              <div className="space-y-4 p-4">
                {nav}
                {account}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
          <AnimatePresence mode="wait">
            {selected && isTeam ? (
              <motion.div key={selected} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                <ProjectWorkspace code={selected} onBack={() => setSelected(null)} onCodeChange={setSelected} notify={notify} />
              </motion.div>
            ) : view === "ideas" && canLead(me.role) ? (
              <motion.div key="ideas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <IdeasInbox key={ideaFocus.n} role={me.role} notify={notify} onOpenProject={setSelected} initialFilter={ideaFocus.filter} initialSelectedId={ideaFocus.id} />
              </motion.div>
            ) : view === "payments" && me.role === "admin" ? (
              <motion.div key="payments" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PaymentsView
                  notify={notify}
                  onOpenIdea={(id) => {
                    setIdeaFocus((f) => ({ id, n: f.n + 1 }));
                    go("ideas");
                  }}
                />
              </motion.div>
            ) : view === "settings" && me.role === "admin" ? (
              <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SettingsScreen notify={notify} />
              </motion.div>
            ) : view === "reports" && me.role === "admin" ? (
              <motion.div key="reports" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Reports notify={notify} onOpenProject={setSelected} />
              </motion.div>
            ) : view === "activity" && me.role === "admin" ? (
              <motion.div key="activity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ActivityLogView onOpenProject={setSelected} />
              </motion.div>
            ) : view === "users" && me.role === "admin" ? (
              <motion.div key="users" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {/* Assignment counts come from the accounts screen itself now — the panel no longer holds every project in the browser. */}
                <UsersManager notify={notify} projects={[]} />
              </motion.div>
            ) : view === "leads" && (me.role === "admin" || me.role === "counsellor") ? (
              <motion.div key="leads" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <LeadsQueue notify={notify} />
              </motion.div>
            ) : !isTeam ? null : view === "website" && me.role === "admin" ? (
              <motion.div key="website" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ContentManager notify={notify} />
              </motion.div>
            ) : view === "messages" ? (
              <motion.div key="messages" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <MessagesInbox notify={notify} onOpen={setSelected} />
              </motion.div>
            ) : view === "outbox" && me.role === "admin" ? (
              <motion.div key="outbox" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Outbox />
              </motion.div>
            ) : view === "approvals" ? (
              <motion.div key="approvals" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Approvals onOpen={setSelected} notify={notify} />
              </motion.div>
            ) : (
              <motion.div key="projects" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Overview
                  summary={summary}
                  layout={layout}
                  setLayout={setLayout}
                  search={search}
                  setSearch={setSearch}
                  stageFilter={stageFilter}
                  setStageFilter={setStageFilter}
                  onOpen={setSelected}
                  onApprovals={() => go("approvals")}
                  onOpenDrafts={() => {
                    setIdeaFocus((f) => ({ filter: "DRAFT", n: f.n + 1 }));
                    go("ideas");
                  }}
                  notify={notify}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} notify={notify} />
    </div>
  );
}

function SidebarBrand() {
  return (
    <Link href="/engineering" className="relative flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-[10px] bg-brand font-display text-[15px] font-bold text-white shadow-lg shadow-brand/30">AI</span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold text-white">AI Project Connect</span>
        <span className="block text-[11px] font-bold uppercase tracking-wider text-brand">Engineering Panel</span>
      </span>
    </Link>
  );
}

function NavItem({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
        active ? "text-white" : "text-white/65 hover:bg-white/5 hover:text-white",
      )}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/10" />}
      {active && <motion.span layoutId="nav-bar" className="absolute left-0 top-2 h-[calc(100%-16px)] w-1 rounded-r bg-brand" />}
      <span className="relative flex w-full items-center gap-3">
        {icon}
        {children}
      </span>
    </button>
  );
}

/** Waits for typing to stop before asking the server. */
function useDebounced(value: string, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return settled;
}

function Overview({
  summary,
  layout,
  setLayout,
  search,
  setSearch,
  stageFilter,
  setStageFilter,
  onOpen,
  onApprovals,
  onOpenDrafts,
  notify,
}: {
  summary: DashboardSummary | undefined;
  layout: "list" | "board";
  setLayout: (l: "list" | "board") => void;
  search: string;
  setSearch: (q: string) => void;
  stageFilter: StageKey | "ALL";
  setStageFilter: (s: StageKey | "ALL") => void;
  onOpen: (code: string) => void;
  onApprovals: () => void;
  onOpenDrafts: () => void;
  notify: Notify;
}) {
  const me = useStaff();
  const [registering, setRegistering] = useState(false);
  const q = useDebounced(search.trim());

  // Searching and filtering happen on the server, so the list is never a stale copy.
  const { projects, loading, error, refresh } = useStaffProjects({ stage: stageFilter === "ALL" ? undefined : stageFilter, q });
  const stale = summary?.staleProjects ?? [];
  const pendingCount = summary?.pendingApprovals ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {greeting}, {me.name.split(" ")[0]} 👋
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {me.role === "admin" ? "Every project on the platform." : "Projects you lead or are assigned to."}
          </p>
        </div>
        {me.role === "admin" && (
          <button onClick={() => setRegistering(true)} className="flex items-center gap-2 self-start rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-600 sm:self-auto">
            <UserPlus className="size-4" /> Start walk-in application
          </button>
        )}
      </div>
      <RegisterProjectDrawer open={registering} onClose={() => setRegistering(false)} onOpenIdeas={onOpenDrafts} notify={notify} />

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat i={0} label="Active projects" value={summary ? String(summary.activeProjects) : null} hint={summary ? `${summary.deliveredProjects} delivered` : "Counting…"} icon={<Zap className="size-5" />} />
        <Stat
          i={1}
          label="Awaiting approval"
          value={summary ? String(pendingCount) : null}
          hint={canLead(me.role) ? "Updates to review" : "Sent to your lead"}
          icon={<Inbox className="size-5" />}
          onClick={pendingCount ? onApprovals : undefined}
          tone={pendingCount ? "brand" : undefined}
        />
        <Stat
          i={2}
          label={`No update ${STALE_DAYS}+ days`}
          value={summary ? String(stale.length) : null}
          hint="Clients waiting for news"
          icon={<AlertTriangle className="size-5" />}
          tone={stale.length ? "danger" : undefined}
        />
        <Stat
          i={3}
          label="Avg days since update"
          value={summary ? String(summary.avgDaysSinceClientUpdate ?? "–") : null}
          hint="Target: 3 days or less"
          icon={<Clock className="size-5" />}
        />
      </div>

      {stale.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-danger/15 bg-danger-soft p-4 sm:flex-row sm:items-center"
        >
          <AlertTriangle className="size-6 shrink-0 text-danger" />
          <p className="flex-1 text-sm">
            <b className="text-danger">Clients haven&apos;t heard from us:</b>{" "}
            {stale.map((p, i) => (
              <span key={p.code}>
                <button onClick={() => onOpen(p.code)} className="font-bold underline decoration-danger/30 underline-offset-2 hover:decoration-danger">
                  {p.title}
                </button>{" "}
                ({p.daysSinceClientUpdate == null ? "never" : `${p.daysSinceClientUpdate} days`})
                {i < stale.length - 1 ? ", " : ""}
              </span>
            ))}
            . Post a quick update.
          </p>
        </motion.div>
      )}

      {/* toolbar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project, ID, client or lead"
            aria-label="Search projects"
            className="h-full w-full bg-transparent text-sm outline-none"
          />
          {loading && projects.length > 0 && <Loader2 className="size-4 shrink-0 animate-spin text-muted" />}
        </div>
        <div className="flex gap-2">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as StageKey | "ALL")}
            aria-label="Filter by stage"
            className="h-11 flex-1 rounded-xl border border-line bg-white px-3 text-sm font-bold outline-none focus:border-brand sm:flex-none"
          >
            <option value="ALL">All stages</option>
            {(Object.keys(STAGES) as StageKey[]).map((s) => (
              <option key={s} value={s}>
                {STAGES[s].label}
              </option>
            ))}
          </select>
          <div className="relative flex rounded-xl border border-line bg-white p-1">
            {(
              [
                ["list", LayoutList, "List"],
                ["board", SquareKanban, "Board"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                aria-pressed={layout === key}
                className={cn("relative flex items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition", layout === key ? "text-white" : "text-muted hover:text-navy")}
              >
                {layout === key && <motion.span layoutId="layout-pill" className="absolute inset-0 rounded-lg bg-navy" />}
                <Icon className="relative size-4" />
                <span className="relative hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4" aria-live="polite" aria-busy={loading}>
        {error && projects.length === 0 ? (
          <ErrorPanel message={error} onRetry={refresh} />
        ) : loading && projects.length === 0 ? (
          <ListSkeleton />
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white py-16 text-center text-muted">No projects match your search.</div>
        ) : layout === "list" ? (
          <ProjectList projects={projects} onOpen={onOpen} />
        ) : (
          <Board projects={projects} onOpen={onOpen} notify={notify} />
        )}
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-10 text-center">
      <AlertTriangle className="size-6 text-danger" />
      <p className="text-sm">{message}</p>
      <button onClick={onRetry} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-navy/30">
        <RotateCw className="size-4" /> Try again
      </button>
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <span className="sr-only">Loading projects…</span>
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-5">
            <span className="h-4 w-1/3 animate-pulse rounded bg-line" />
            <span className="h-4 w-20 animate-pulse rounded-full bg-line" />
            <span className="h-2 flex-1 animate-pulse rounded-full bg-line" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  i,
  tone,
  onClick,
}: {
  label: string;
  /** null while the count is still loading — never show a misleading 0. */
  value: string | null;
  hint: string;
  icon: React.ReactNode;
  i: number;
  tone?: "brand" | "danger";
  onClick?: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06 }}
      whileHover={{ y: -3 }}
      className={cn("rounded-2xl border border-line bg-white p-4 text-left shadow-sm sm:p-5", onClick && "cursor-pointer")}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          tone === "danger" ? "bg-danger-soft text-danger" : tone === "brand" ? "bg-brand text-white" : "bg-brand-soft text-brand-700",
        )}
      >
        {icon}
      </span>
      {value === null ? (
        <span className="mt-4 block h-6 w-10 animate-pulse rounded bg-line sm:h-8" />
      ) : (
        <p className="mt-3 font-display text-2xl font-bold sm:text-3xl">{value}</p>
      )}
      <p className="text-sm font-bold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
    </motion.div>
  );
}

function LastUpdate({ project }: { project: ProjectSummary }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-sm", project.stale ? "font-bold text-danger" : "text-muted")}>
      {project.stale && <AlertTriangle className="size-4" />}
      {project.lastClientUpdateAt ? relativeDay(project.lastClientUpdateAt) : "No updates"}
      {project.stale && <span className="sr-only">(stale)</span>}
    </span>
  );
}

function ProjectList({ projects, onOpen }: { projects: ProjectSummary[]; onOpen: (code: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="hidden grid-cols-[2.2fr_1.1fr_1.4fr_1fr_1fr_24px] gap-4 border-b border-line bg-mist/60 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted md:grid">
        <span>Project</span>
        <span>Stage</span>
        <span>Progress</span>
        <span>Client update</span>
        <span>Lead</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {projects.map((p, i) => (
          <motion.li key={p.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
            <button
              onClick={() => onOpen(p.code)}
              className="group grid w-full grid-cols-1 gap-3 px-5 py-4 text-left transition hover:bg-brand-soft/30 md:grid-cols-[2.2fr_1.1fr_1.4fr_1fr_1fr_24px] md:items-center md:gap-4"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display font-semibold">{p.title}</span>
                  {p.pendingUpdates > 0 && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{p.pendingUpdates} pending</span>}
                  {p.needsReply && <span className="shrink-0 rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white">new message</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  <span className="font-mono">{p.code}</span> · {p.clientName ?? "Client"}
                </span>
              </span>
              <span>
                <StageBadge stage={p.stage} />
              </span>
              <span className="flex items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <motion.span
                    className={cn("block h-full rounded-full", p.stage === "ON_HOLD" ? "bg-danger/70" : p.stage === "DELIVERED" ? "bg-teal" : "bg-brand")}
                    initial={{ width: 0 }}
                    animate={{ width: `${p.progress}%` }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.04 }}
                  />
                </span>
                <span className="w-9 text-right text-sm font-bold tabular-nums">{p.progress}%</span>
              </span>
              <LastUpdate project={p} />
              <span className="flex items-center gap-2 text-sm">
                <span className="grid size-7 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">{initials(p.leadName ?? "Aptech team")}</span>
                <span className="truncate">{p.leadName ?? "Unassigned"}</span>
              </span>
              <ChevronRight className="hidden size-5 text-muted transition group-hover:translate-x-1 group-hover:text-brand md:block" />
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function Board({ projects, onOpen, notify }: { projects: ProjectSummary[]; onOpen: (code: string) => void; notify: Notify }) {
  const me = useStaff();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StageKey | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const drop = async (stage: StageKey) => {
    const p = projects.find((x) => x.code === dragging);
    setDragging(null);
    setOver(null);
    if (!p || p.stage === stage || moving) return;
    if (!canLeadSummary(me, p)) {
      notify("Only this project's lead or an admin can change its stage.", "info");
      return;
    }
    if (stage === "ON_HOLD") {
      notify("Open the project to put it on hold. A reason is required.", "info");
      return;
    }
    setMoving(p.code);
    try {
      await changeStage(p.code, stage);
      notify(`${p.title} moved to ${STAGES[stage].label}. The client has been notified.`);
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setMoving(null);
    }
  };

  return (
    <LayoutGroup>
      <p className="mb-3 text-xs text-muted">
        {canLead(me.role) ? "Drag a card to another column to change its stage." : "Only project leads can drag cards between stages."}
      </p>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {BOARD.map((stage) => {
          const items = projects.filter((p) => p.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={() => void drop(stage)}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-2xl border-2 bg-white/60 p-2.5 transition",
                over === stage && dragging ? "border-brand bg-brand-soft/40" : "border-transparent",
              )}
            >
              <div className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                <StageBadge stage={stage} />
                <span className="text-xs font-bold text-muted">{items.length}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2">
                {items.map((p) => (
                  <motion.div
                    layout
                    layoutId={`card-${p.code}`}
                    key={p.code}
                    draggable={!moving}
                    onDragStartCapture={() => setDragging(p.code)}
                    onDragEndCapture={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onClick={() => onOpen(p.code)}
                    whileHover={{ y: -2 }}
                    className={cn(
                      "cursor-pointer rounded-xl border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
                      (dragging === p.code || moving === p.code) && "opacity-50",
                    )}
                  >
                    <p className="font-display text-sm font-semibold">{p.title}</p>
                    <p className="font-mono text-[11px] text-muted">{p.code}</p>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className={cn("h-full rounded-full", p.stage === "DELIVERED" ? "bg-teal" : p.stage === "ON_HOLD" ? "bg-danger/70" : "bg-brand")} style={{ width: `${p.progress}%` }} />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <LastUpdate project={p} />
                      <span className="grid size-6 place-items-center rounded-full bg-navy text-[9px] font-bold text-white">{initials(p.leadName ?? "Aptech team")}</span>
                    </div>
                  </motion.div>
                ))}
                {items.length === 0 && <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-6 text-xs text-muted">No projects</p>}
              </div>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Approvals({ onOpen, notify }: { onOpen: (code: string) => void; notify: Notify }) {
  const me = useStaff();
  const { updates: items, loading, error } = useApprovals();
  const [busy, setBusy] = useState<string | null>(null);
  const mayApprove = canLead(me.role);

  const act = async (update: PendingUpdate, decision: "approve" | "reject") => {
    setBusy(String(update.id));
    try {
      if (decision === "approve") {
        await approveUpdate(update.id);
        notify(`Published to ${update.projectTitle}'s client portal.`);
      } else {
        await deleteUpdate(update.id);
        notify("Update sent back to the engineer.", "info");
      }
    } catch (e) {
      notify(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Approvals</h1>
      <p className="mt-1 text-muted">
        {mayApprove ? "Client-visible updates from engineers wait here until you approve them." : "Updates you've sent for lead approval."}
      </p>

      <div className="mt-6 space-y-3" aria-live="polite" aria-busy={loading}>
        {error && items.length === 0 ? (
          <ErrorPanel message={error} onRetry={() => void refreshProjects()} />
        ) : loading && items.length === 0 ? (
          <ListSkeleton rows={2} />
        ) : (
          <AnimatePresence initial={false}>
            {items.map((update) => (
              <motion.div
                key={update.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60, height: 0, marginTop: 0 }}
                className="overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onOpen(update.projectCode)} className="text-xs font-bold text-brand-700 hover:underline">
                      {update.projectTitle} · <span className="font-mono">{update.projectCode}</span>
                    </button>
                    <p className="mt-1 font-display font-semibold">{update.title}</p>
                    <p className="mt-1 text-sm text-navy/75">{update.body}</p>
                    <p className="mt-2 text-xs text-muted">
                      {update.author.name} · {update.author.role} · {relativeDay(update.date)}
                    </p>
                  </div>
                  {mayApprove ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        disabled={busy === String(update.id)}
                        onClick={() => void act(update, "reject")}
                        className="rounded-full border border-line px-4 py-2 text-sm font-bold text-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
                      >
                        Reject
                      </button>
                      <button
                        disabled={busy === String(update.id)}
                        onClick={() => void act(update, "approve")}
                        className="flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-40"
                      >
                        {busy === String(update.id) ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Approve &amp; publish
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-700">Waiting for lead</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {!loading && !error && items.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-line bg-white py-16 text-center">
            <CheckCheck className="mx-auto size-10 text-teal" />
            <p className="mt-2 font-display font-semibold">All caught up</p>
            <p className="text-sm text-muted">No updates waiting for approval.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
