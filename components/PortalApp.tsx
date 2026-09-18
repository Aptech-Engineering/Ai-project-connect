"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import Hero from "./Hero";
import ProjectStatus from "./status/ProjectStatus";
import Footer from "./Footer";
import Toaster, { type Toast } from "./Toaster";
import SubmitIdeaModal from "./SubmitIdeaModal";
import { clientSignOut, useClientProject, useClientSession } from "@/lib/store";
import { onSessionExpired } from "@/lib/api";
import { useSiteContent } from "@/lib/content";
import { CoursesSection, FliersSection } from "./HomeSections";

export type Notify = (message: string, tone?: Toast["tone"]) => void;

/** Which project this browser tab had open, so a refresh returns to it. */
const LAST_PROJECT = "apc-last-project";

export default function PortalApp() {
  const [projectCode, setProjectCode] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [idea, setIdea] = useState<{ open: boolean; email?: string; resume?: string }>({ open: false });
  const openIdea = useCallback((email?: string) => setIdea({ open: true, email }), []);
  const closeIdea = useCallback(() => setIdea((s) => ({ ...s, open: false })), []);
  const statusRef = useRef<HTMLDivElement>(null);
  const { brand } = useSiteContent();
  const { session: client, refresh: refreshSession } = useClientSession();
  const { data: project, error: projectError } = useClientProject(projectCode);

  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    if (!projectCode) return;
    const t = window.setTimeout(() => statusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => window.clearTimeout(t);
  }, [projectCode]);

  // Remember which project is open, so a refresh doesn't ask for the Project ID again.
  // (Cleared on sign-out, not here: on a fresh load projectCode starts empty.)
  useEffect(() => {
    if (!projectCode) return;
    try {
      sessionStorage.setItem(LAST_PROJECT, projectCode);
    } catch {
      /* private mode */
    }
  }, [projectCode]);

  // Still signed in after a reload: reopen where they were, or their only project.
  useEffect(() => {
    if (projectCode || !client) return;
    let last: string | null = null;
    try {
      last = sessionStorage.getItem(LAST_PROJECT);
    } catch {
      /* private mode */
    }
    const codes = client.projects.map((p) => p.code);
    const reopen = last && codes.includes(last) ? last : codes.length === 1 ? codes[0] : null;
    if (reopen) setProjectCode(reopen);
  }, [client, projectCode]);

  // The project is gone for this client: usually a Project ID the team regenerated.
  useEffect(() => {
    if (projectCode && projectError) {
      setProjectCode(null);
      setSession((n) => n + 1);
      notify("We couldn't open that project. If your team sent you a new Project ID, sign in with that one.", "info");
    }
  }, [projectCode, projectError, notify]);

  // The server ended the client session (signed out elsewhere, or it expired).
  useEffect(
    () =>
      onSessionExpired((kind) => {
        // Only meaningful while someone is actually signed in.
        if (kind !== "client" || !projectCode) return;
        setProjectCode(null);
        setSession((n) => n + 1);
        void refreshSession();
      }),
    [refreshSession, projectCode],
  );

  // "Continue your application" links from email: /?resume=<token>
  useEffect(() => {
    const url = new URL(window.location.href);
    const resume = url.searchParams.get("resume");
    if (!resume) return;
    setIdea({ open: true, resume });
    // Don't leave the private token in the address bar or history.
    url.searchParams.delete("resume");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    if (brand.pageTitle) document.title = brand.pageTitle;
  }, [brand.pageTitle]);

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(LAST_PROJECT);
    } catch {
      /* private mode */
    }
    await clientSignOut();
    await refreshSession();
    setProjectCode(null);
    setSession((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [refreshSession]);

  return (
    <>
      <Navbar client={project?.client.short ?? client?.client.short} onSignOut={signOut} onSubmitIdea={() => openIdea()} />
      <main>
        <Hero key={session} onVerified={setProjectCode} onReset={signOut} verifiedProject={project} />
        {project && (
          <div ref={statusRef} className="scroll-mt-16">
            <ProjectStatus project={project} onSwitch={setProjectCode} onSignOut={signOut} notify={notify} />
          </div>
        )}
        <FliersSection onSubmitIdea={() => openIdea()} />
        <CoursesSection notify={notify} />
      </main>
      <Footer notify={notify} onSubmitIdea={openIdea} />
      <SubmitIdeaModal open={idea.open} initialEmail={idea.email} resumeToken={idea.resume} onClose={closeIdea} />
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}
