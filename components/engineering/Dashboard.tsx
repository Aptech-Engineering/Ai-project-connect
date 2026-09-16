"use client";

import { useMemo, useState } from "react";
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
  BellRing,
  GraduationCap,
  MessageCircle,
  Lightbulb,
  LayoutList,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  SquareKanban,
  X,
  Zap,
} from "lucide-react";
import StageBadge from "../status/StageBadge";
import ProjectWorkspace from "./ProjectWorkspace";
import IdeasInbox from "./IdeasInbox";
import { resetIdeas, useIdeas } from "@/lib/ideas";
import { STAGES, STAGE_MIN_PROGRESS, STALE_DAYS, isClientVisible } from "@/lib/data";
import { resetStore, updateProject, useLeads, useOutbox, useProjects, withActivity } from "@/lib/store";
import { announceStage, announceUpdate } from "@/lib/actions";
import { LeadsQueue, MessagesInbox, Outbox } from "./Queues";
import { cn, initials, relativeDay } from "@/lib/format";
import type { Project, StageKey } from "@/lib/types";
import type { Notify } from "../PortalApp";
import type { StaffSession } from "./EngineeringApp";
import { actingAs, daysSinceClientUpdate, isStale, type StaffRole } from "./helpers";

type View = "projects" | "approvals" | "ideas" | "messages" | "leads" | "outbox";

const BOARD: StageKey[] = ["UNDER_REVIEW", "DESIGN", "DEVELOPMENT", "TESTING", "DEPLOYMENT", "DELIVERED", "ON_HOLD"];

export default function Dashboard({
  session,
  onRoleChange,
  onSignOut,
  notify,
}: {
  session: StaffSession;
  onRoleChange: (role: StaffRole) => void;
  onSignOut: () => void;
  notify: Notify;
}) {
  const projects = useProjects();
  const [view, setView] = useState<View>("projects");
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageKey | "ALL">("ALL");
  const [menuOpen, setMenuOpen] = useState(false);

  const newIdeas = useIdeas().filter((i) => i.status === "NEW").length;
  const needsReply = projects.filter((p) => p.messages?.length && p.messages[p.messages.length - 1].from === "client").length;
  const newLeads = useLeads().filter((l) => l.status === "NEW").length;
  const outboxCount = useOutbox().length;
  const pendingCount = projects.reduce((n, p) => n + p.updates.filter((u) => u.pending).length, 0);
  const selectedProject = projects.find((p) => p.code === selected);

  const go = (v: View) => {
    setView(v);
    setSelected(null);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      <NavItem active={view === "projects" && !selected} onClick={() => go("projects")} icon={<FolderKanban className="size-5" />}>
        Projects
        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs">{projects.length}</span>
      </NavItem>
      <NavItem active={view === "ideas" && !selected} onClick={() => go("ideas")} icon={<Lightbulb className="size-5" />}>
        Ideas
        {newIdeas > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{newIdeas} new</span>}
      </NavItem>
      <NavItem active={view === "approvals" && !selected} onClick={() => go("approvals")} icon={<Inbox className="size-5" />}>
        Approvals
        {pendingCount > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{pendingCount}</span>}
      </NavItem>
      <NavItem active={view === "messages" && !selected} onClick={() => go("messages")} icon={<MessageCircle className="size-5" />}>
        Client messages
        {needsReply > 0 && <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{needsReply}</span>}
      </NavItem>
      <NavItem active={view === "leads" && !selected} onClick={() => go("leads")} icon={<GraduationCap className="size-5" />}>
        Course leads
        {newLeads > 0 && <span className="ml-auto rounded-full bg-teal px-2 py-0.5 text-xs font-bold text-white">{newLeads} new</span>}
      </NavItem>
      <NavItem active={view === "outbox" && !selected} onClick={() => go("outbox")} icon={<BellRing className="size-5" />}>
        Notifications
        {outboxCount > 0 && <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs">{outboxCount}</span>}
      </NavItem>
      <Link href="/" target="_blank" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/5 hover:text-white">
        <ArrowUpRight className="size-5" /> Open client portal
      </Link>
    </nav>
  );

  const account = (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white/5 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Acting as</p>
        <div className="relative mt-2 grid grid-cols-2 rounded-xl bg-navy-950/60 p-1 text-xs font-bold">
          {(["lead", "engineer"] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                onRoleChange(r);
                notify(r === "lead" ? "Now acting as Project lead: you can change stages and approve updates." : "Now acting as Engineer: client updates need lead approval.", "info");
              }}
              className={cn("relative rounded-lg py-2 transition", session.role === r ? "text-navy" : "text-white/60 hover:text-white")}
            >
              {session.role === r && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-lg bg-white" />}
              <span className="relative">{r === "lead" ? "Project lead" : "Engineer"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 px-1">
        <span className="grid size-10 place-items-center rounded-full bg-brand font-display text-sm font-bold text-white">AD</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Aptech Dev Team</p>
          <p className="truncate text-xs text-white/50">{session.login}</p>
        </div>
        <button onClick={onSignOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
          <LogOut className="size-5" />
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
            {selectedProject ? (
              <motion.div key={selectedProject.code} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                <ProjectWorkspace project={selectedProject} role={session.role} onBack={() => setSelected(null)} onCodeChange={setSelected} notify={notify} />
              </motion.div>
            ) : view === "ideas" ? (
              <motion.div key="ideas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <IdeasInbox role={session.role} notify={notify} onOpenProject={setSelected} />
              </motion.div>
            ) : view === "messages" ? (
              <motion.div key="messages" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <MessagesInbox role={session.role} notify={notify} onOpen={setSelected} />
              </motion.div>
            ) : view === "leads" ? (
              <motion.div key="leads" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <LeadsQueue notify={notify} />
              </motion.div>
            ) : view === "outbox" ? (
              <motion.div key="outbox" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Outbox />
              </motion.div>
            ) : view === "approvals" ? (
              <motion.div key="approvals" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Approvals projects={projects} role={session.role} onOpen={setSelected} notify={notify} />
              </motion.div>
            ) : (
              <motion.div key="projects" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Overview
                  projects={projects}
                  role={session.role}
                  pendingCount={pendingCount}
                  layout={layout}
                  setLayout={setLayout}
                  query={query}
                  setQuery={setQuery}
                  stageFilter={stageFilter}
                  setStageFilter={setStageFilter}
                  onOpen={setSelected}
                  onApprovals={() => go("approvals")}
                  notify={notify}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
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

function Overview({
  projects,
  role,
  pendingCount,
  layout,
  setLayout,
  query,
  setQuery,
  stageFilter,
  setStageFilter,
  onOpen,
  onApprovals,
  notify,
}: {
  projects: Project[];
  role: StaffRole;
  pendingCount: number;
  layout: "list" | "board";
  setLayout: (l: "list" | "board") => void;
  query: string;
  setQuery: (q: string) => void;
  stageFilter: StageKey | "ALL";
  setStageFilter: (s: StageKey | "ALL") => void;
  onOpen: (code: string) => void;
  onApprovals: () => void;
  notify: Notify;
}) {
  const active = projects.filter((p) => p.stage !== "DELIVERED");
  const stale = projects.filter(isStale);
  const avgGap = useMemo(() => {
    const gaps = active.map(daysSinceClientUpdate).filter(Number.isFinite);
    return gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : "–";
  }, [active]);

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    const matches = !q || [p.title, p.code, p.client.name, p.lead.name].some((s) => s.toLowerCase().includes(q));
    return matches && (stageFilter === "ALL" || p.stage === stageFilter);
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{greeting}, Dev Team 👋</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Projects</h1>
        </div>
        <button
          onClick={() => {
            resetStore();
            resetIdeas();
            notify("Demo data reset to the original mock projects.", "info");
          }}
          className="flex items-center gap-2 self-start rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-muted transition hover:text-navy sm:self-auto"
        >
          <RotateCcw className="size-4" /> Reset demo data
        </button>
      </div>

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat i={0} label="Active projects" value={String(active.length)} hint={`${projects.length - active.length} delivered`} icon={<Zap className="size-5" />} />
        <Stat
          i={1}
          label="Awaiting approval"
          value={String(pendingCount)}
          hint={role === "lead" ? "Updates to review" : "Sent to your lead"}
          icon={<Inbox className="size-5" />}
          onClick={pendingCount ? onApprovals : undefined}
          tone={pendingCount ? "brand" : undefined}
        />
        <Stat i={2} label={`No update ${STALE_DAYS}+ days`} value={String(stale.length)} hint="Clients waiting for news" icon={<AlertTriangle className="size-5" />} tone={stale.length ? "danger" : undefined} />
        <Stat i={3} label="Avg days since update" value={avgGap} hint="Target: 3 days or less" icon={<Clock className="size-5" />} />
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
                ({Number.isFinite(daysSinceClientUpdate(p)) ? `${daysSinceClientUpdate(p)} days` : "never"})
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by project, ID, client or lead"
            className="h-full w-full bg-transparent text-sm outline-none"
          />
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

      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white py-16 text-center text-muted">No projects match your search.</div>
        ) : layout === "list" ? (
          <ProjectList projects={filtered} onOpen={onOpen} />
        ) : (
          <Board projects={filtered} role={role} onOpen={onOpen} notify={notify} />
        )}
      </div>
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
  value: string;
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
      <p className="mt-3 font-display text-2xl font-bold sm:text-3xl">{value}</p>
      <p className="text-sm font-bold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
    </motion.div>
  );
}

function LastUpdate({ project }: { project: Project }) {
  const days = daysSinceClientUpdate(project);
  const stale = isStale(project);
  const last = project.updates.find(isClientVisible);
  return (
    <span className={cn("flex items-center gap-1.5 text-sm", stale ? "font-bold text-danger" : "text-muted")}>
      {stale && <AlertTriangle className="size-4" />}
      {last ? relativeDay(last.date) : "No updates"}
      {stale && Number.isFinite(days) && <span className="sr-only">(stale)</span>}
    </span>
  );
}

function ProjectList({ projects, onOpen }: { projects: Project[]; onOpen: (code: string) => void }) {
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
        {projects.map((p, i) => {
          const pending = p.updates.filter((u) => u.pending).length;
          return (
            <motion.li key={p.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
              <button
                onClick={() => onOpen(p.code)}
                className="group grid w-full grid-cols-1 gap-3 px-5 py-4 text-left transition hover:bg-brand-soft/30 md:grid-cols-[2.2fr_1.1fr_1.4fr_1fr_1fr_24px] md:items-center md:gap-4"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display font-semibold">{p.title}</span>
                    {pending > 0 && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{pending} pending</span>}
                    {p.messages?.length && p.messages[p.messages.length - 1].from === "client" ? (
                      <span className="shrink-0 rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white">new message</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    <span className="font-mono">{p.code}</span> · {p.client.name}
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
                  <span className="grid size-7 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">{initials(p.lead.name)}</span>
                  <span className="truncate">{p.lead.name}</span>
                </span>
                <ChevronRight className="hidden size-5 text-muted transition group-hover:translate-x-1 group-hover:text-brand md:block" />
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function Board({ projects, role, onOpen, notify }: { projects: Project[]; role: StaffRole; onOpen: (code: string) => void; notify: Notify }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StageKey | null>(null);

  const drop = (stage: StageKey) => {
    const p = projects.find((x) => x.code === dragging);
    setDragging(null);
    setOver(null);
    if (!p || p.stage === stage) return;
    if (role !== "lead") {
      notify("Only the project lead or admin can change a stage.", "info");
      return;
    }
    if (stage === "ON_HOLD") {
      notify("Open the project to put it on hold. A reason is required.", "info");
      return;
    }
    const author = actingAs(role);
    updateProject(p.code, (proj) =>
      withActivity(
        {
          ...proj,
          stage,
          holdReason: undefined,
          deliveredDate: stage === "DELIVERED" ? new Date().toISOString() : undefined,
          progress: Math.max(proj.progress, STAGE_MIN_PROGRESS[stage] ?? 0),
          updates: [
            { id: Math.random().toString(36).slice(2), date: new Date().toISOString(), kind: "stage", author, title: `Stage changed to ${STAGES[stage].label}`, body: STAGES[stage].meaning },
            ...proj.updates,
          ],
        },
        author,
        `Changed stage from ${STAGES[proj.stage].label} to ${STAGES[stage].label}`,
      ),
    );
    announceStage(p, stage);
    notify(`${p.title} moved to ${STAGES[stage].label}. The client has been notified.`);
  };

  return (
    <LayoutGroup>
      <p className="mb-3 text-xs text-muted">{role === "lead" ? "Drag a card to another column to change its stage." : "Only project leads can drag cards between stages."}</p>
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
              onDrop={() => drop(stage)}
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
                    draggable
                    onDragStartCapture={() => setDragging(p.code)}
                    onDragEndCapture={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onClick={() => onOpen(p.code)}
                    whileHover={{ y: -2 }}
                    className={cn(
                      "cursor-pointer rounded-xl border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
                      dragging === p.code && "opacity-50",
                    )}
                  >
                    <p className="font-display text-sm font-semibold">{p.title}</p>
                    <p className="font-mono text-[11px] text-muted">{p.code}</p>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className={cn("h-full rounded-full", p.stage === "DELIVERED" ? "bg-teal" : p.stage === "ON_HOLD" ? "bg-danger/70" : "bg-brand")} style={{ width: `${p.progress}%` }} />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <LastUpdate project={p} />
                      <span className="grid size-6 place-items-center rounded-full bg-navy text-[9px] font-bold text-white">{initials(p.lead.name)}</span>
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

function Approvals({ projects, role, onOpen, notify }: { projects: Project[]; role: StaffRole; onOpen: (code: string) => void; notify: Notify }) {
  const items = projects.flatMap((p) => p.updates.filter((u) => u.pending).map((u) => ({ project: p, update: u })));

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Approvals</h1>
      <p className="mt-1 text-muted">
        {role === "lead" ? "Client-visible updates from engineers wait here until you approve them." : "Updates you've sent for lead approval."}
      </p>

      <div className="mt-6 space-y-3">
        <AnimatePresence initial={false}>
          {items.map(({ project, update }) => (
            <motion.div
              key={project.code + update.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 60, height: 0, marginTop: 0 }}
              className="overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(project.code)} className="text-xs font-bold text-brand-700 hover:underline">
                    {project.title} · <span className="font-mono">{project.code}</span>
                  </button>
                  <p className="mt-1 font-display font-semibold">{update.title}</p>
                  <p className="mt-1 text-sm text-navy/75">{update.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {update.author.name} · {update.author.role} · {relativeDay(update.date)}
                  </p>
                </div>
                {role === "lead" ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => {
                        updateProject(project.code, (p) => withActivity({ ...p, updates: p.updates.filter((u) => u.id !== update.id) }, actingAs(role), `Rejected update "${update.title}"`));
                        notify("Update sent back to the engineer.", "info");
                      }}
                      className="rounded-full border border-line px-4 py-2 text-sm font-bold text-muted hover:border-danger hover:text-danger"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        updateProject(project.code, (p) =>
                          withActivity(
                            { ...p, updates: p.updates.map((u) => (u.id === update.id ? { ...u, pending: false, date: new Date().toISOString() } : u)) },
                            actingAs(role),
                            `Approved and published "${update.title}"`,
                          ),
                        );
                        announceUpdate(project, update);
                        notify(`Published to ${project.client.name}'s portal.`);
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"
                    >
                      <CheckCheck className="size-4" /> Approve & publish
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-700">Waiting for lead</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && (
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
