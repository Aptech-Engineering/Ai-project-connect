"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import Hero from "./Hero";
import ProjectStatus from "./status/ProjectStatus";
import Footer from "./Footer";
import Toaster, { type Toast } from "./Toaster";
import SubmitIdeaModal from "./SubmitIdeaModal";
import { useProjects } from "@/lib/store";

export type Notify = (message: string, tone?: Toast["tone"]) => void;

export default function PortalApp() {
  const [projectCode, setProjectCode] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [idea, setIdea] = useState<{ open: boolean; email?: string }>({ open: false });
  const openIdea = useCallback((email?: string) => setIdea({ open: true, email }), []);
  const closeIdea = useCallback(() => setIdea((s) => ({ ...s, open: false })), []);
  const statusRef = useRef<HTMLDivElement>(null);
  const projects = useProjects();
  const project = projectCode ? projects.find((p) => p.code === projectCode) : undefined;

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

  // If staff regenerate the Project ID while the client is viewing, end the session.
  useEffect(() => {
    if (projectCode && !project) {
      setProjectCode(null);
      setSession((n) => n + 1);
      notify("Your Project ID was changed by the team for security. Please sign in with the new ID we sent you.", "info");
    }
  }, [projectCode, project, notify]);

  const signOut = useCallback(() => {
    setProjectCode(null);
    setSession((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      <Navbar client={project?.client.short} onSignOut={signOut} onSubmitIdea={() => openIdea()} />
      <main>
        <Hero key={session} onVerified={setProjectCode} onReset={signOut} verifiedProject={project} />
        {project && (
          <div ref={statusRef} className="scroll-mt-16">
            <ProjectStatus project={project} onSwitch={setProjectCode} onSignOut={signOut} notify={notify} />
          </div>
        )}
      </main>
      <Footer notify={notify} onSubmitIdea={openIdea} />
      <SubmitIdeaModal open={idea.open} initialEmail={idea.email} onClose={closeIdea} />
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}
