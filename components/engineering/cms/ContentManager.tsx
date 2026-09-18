"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, FileText, Wallet, GraduationCap, Home, Layers, Megaphone, MessagesSquare, PanelBottom, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { Card, ImagePicker, LinkList, StringList, TextArea, TextInput, Toggle } from "./fields";
import { CoursesEditor, TechnologiesEditor } from "./CatalogEditors";
import { publishSiteContent, resetSiteContent, useSiteContent, type Flier, type SiteContent } from "@/lib/content";
import { resetCatalog } from "@/lib/catalog";
import { logActivity } from "@/lib/store";
import { useStaff } from "@/lib/staff";
import { STAGES } from "@/lib/data";
import { cn } from "@/lib/format";
import type { StageKey } from "@/lib/types";
import type { Notify } from "../../PortalApp";

type Tab = "home" | "promotions" | "courses" | "technologies" | "portal" | "ideaForm" | "payments" | "footer";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "home", label: "Home page", icon: Home },
  { key: "promotions", label: "Promotions & fliers", icon: Megaphone },
  { key: "courses", label: "Courses & pricing", icon: GraduationCap },
  { key: "technologies", label: "Technologies", icon: Layers },
  { key: "portal", label: "Client portal", icon: MessagesSquare },
  { key: "ideaForm", label: "Idea form", icon: FileText },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "footer", label: "Footer & contact", icon: PanelBottom },
];

export default function ContentManager({ notify }: { notify: Notify }) {
  const me = useStaff();
  const live = useSiteContent();
  const [draft, setDraft] = useState<SiteContent>(live);
  const [tab, setTab] = useState<Tab>("home");
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  // Pick up changes published elsewhere (e.g. another tab) when there are no local edits.
  useEffect(() => {
    if (!dirty) setDraft(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const update = <K extends keyof SiteContent>(section: K, patch: Partial<SiteContent[K]>) =>
    setDraft((d) => ({ ...d, [section]: { ...d[section], ...patch } }));

  const publish = () => {
    publishSiteContent(draft);
    logActivity(`${me.name} (Admin)`, "Published website content");
    notify("Website updated. Changes are live on the site.");
  };

  return (
    <div className="pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Website content</h1>
          <p className="mt-1 text-muted">Edit every text, course, price, flier and form option on the public site and client portal.</p>
        </div>
        <a href="/" target="_blank" className="flex items-center gap-2 self-start rounded-full border border-line bg-white px-4 py-2 text-sm font-bold transition hover:border-navy/30 sm:self-auto">
          <Eye className="size-4" /> View live site
        </a>
      </div>

      <div className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-white p-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition", tab === key ? "text-white" : "text-muted hover:text-navy")}
          >
            {tab === key && <motion.span layoutId="cms-tab" className="absolute inset-0 rounded-xl bg-navy" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <Icon className="relative size-4" />
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-5 space-y-5">
          {tab === "home" && <HomeTab draft={draft} update={update} />}
          {tab === "promotions" && <PromotionsTab draft={draft} update={update} />}
          {tab === "courses" && (
            <>
              <Card title="Courses section on the home page" description="Text around the course cards. Course details are managed below.">
                <Toggle label="Show courses on the home page" checked={draft.courses.showOnHome} onChange={(v) => update("courses", { showOnHome: v })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Small heading" value={draft.courses.eyebrow} onChange={(v) => update("courses", { eyebrow: v })} />
                  <TextInput label="Title" value={draft.courses.title} onChange={(v) => update("courses", { title: v })} />
                </div>
                <TextArea label="Subtitle" rows={2} value={draft.courses.subtitle} onChange={(v) => update("courses", { subtitle: v })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Enquiry button" value={draft.courses.enquiryButton} onChange={(v) => update("courses", { enquiryButton: v })} />
                  <TextInput label="Enrol button" value={draft.courses.enrolButton} onChange={(v) => update("courses", { enrolButton: v })} />
                </div>
              </Card>
              <CoursesEditor notify={notify} />
            </>
          )}
          {tab === "technologies" && <TechnologiesEditor notify={notify} />}
          {tab === "portal" && <PortalTab draft={draft} update={update} />}
          {tab === "ideaForm" && <IdeaFormTab draft={draft} update={update} />}
          {tab === "payments" && <PaymentsTab draft={draft} update={update} />}
          {tab === "footer" && <FooterTab draft={draft} update={update} />}
        </motion.div>
      </AnimatePresence>

      {/* danger zone */}
      <div className="mt-8 rounded-2xl border border-danger/20 bg-white p-5">
        <p className="font-display font-bold text-danger">Reset website to defaults</p>
        <p className="mt-1 text-sm text-muted">Restores all website text, courses, prices and technologies to the original content. Uploaded images stay in storage.</p>
        {confirmReset ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setConfirmReset(false)} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-muted">
              Cancel
            </button>
            <button
              onClick={() => {
                resetSiteContent();
                resetCatalog();
                logActivity(`${me.name} (Admin)`, "Reset website content to defaults");
                setConfirmReset(false);
                notify("Website content reset to defaults.", "info");
              }}
              className="rounded-full bg-danger px-4 py-2 text-sm font-bold text-white"
            >
              Yes, reset everything
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="mt-3 flex items-center gap-2 rounded-full border border-danger/30 px-4 py-2 text-sm font-bold text-danger hover:bg-danger-soft">
            <RotateCcw className="size-4" /> Reset to defaults
          </button>
        )}
      </div>

      {/* publish bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl bg-navy p-3 pl-5 text-white shadow-2xl sm:flex-row sm:items-center lg:left-[calc(16rem+1rem)]"
          >
            <p className="flex-1 text-sm">
              <b>Unpublished changes.</b> <span className="text-white/65">Visitors still see the previous version.</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDraft(live)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10">
                <Undo2 className="size-4" /> Discard
              </button>
              <button onClick={publish} className="flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold hover:bg-brand-600">
                <Save className="size-4" /> Publish
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type TabProps = {
  draft: SiteContent;
  update: <K extends keyof SiteContent>(section: K, patch: Partial<SiteContent[K]>) => void;
};

function HomeTab({ draft, update }: TabProps) {
  const { brand, announcement, nav, hero } = draft;
  return (
    <>
      <Card title="Brand">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Site name" value={brand.name} onChange={(v) => update("brand", { name: v })} />
          <TextInput label="Browser tab title" value={brand.pageTitle} onChange={(v) => update("brand", { pageTitle: v })} />
        </div>
      </Card>

      <Card title="Announcement bar" description="A slim bar above the navigation for news, offers or deadlines.">
        <Toggle label="Show announcement bar" checked={announcement.enabled} onChange={(v) => update("announcement", { enabled: v })} />
        <TextInput label="Message" value={announcement.text} onChange={(v) => update("announcement", { text: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Link label" value={announcement.linkLabel} onChange={(v) => update("announcement", { linkLabel: v })} />
          <TextInput label="Link destination" value={announcement.linkHref} onChange={(v) => update("announcement", { linkHref: v })} placeholder="#courses or https://…" />
        </div>
      </Card>

      <Card title="Navigation">
        <LinkList label="Menu links" items={nav.links} onChange={(links) => update("nav", { links })} />
        <TextInput label="Main button label" hint="Opens the Submit your idea form." value={nav.ctaLabel} onChange={(v) => update("nav", { ctaLabel: v })} />
      </Card>

      <Card title="Hero section">
        <TextInput label="Small heading above the title" value={hero.eyebrow} onChange={(v) => update("hero", { eyebrow: v })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Title line 1" value={hero.titleLine1} onChange={(v) => update("hero", { titleLine1: v })} />
          <TextInput label="Title line 2" value={hero.titleLine2} onChange={(v) => update("hero", { titleLine2: v })} />
          <TextInput label="Highlighted word (orange)" value={hero.highlight} onChange={(v) => update("hero", { highlight: v })} />
        </div>
        <TextInput label="Subtitle (bold start)" value={hero.subtitleLead} onChange={(v) => update("hero", { subtitleLead: v })} />
        <TextArea label="Subtitle" rows={2} value={hero.subtitle} onChange={(v) => update("hero", { subtitle: v })} />
        <StringList label="Trust points under the search bar" items={hero.trustPoints} onChange={(trustPoints) => update("hero", { trustPoints })} />
        <Toggle label="Show the animated portal preview card" checked={hero.showPreviewCard} onChange={(v) => update("hero", { showPreviewCard: v })} />
      </Card>

      <Card title="Project tracker">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Label" value={hero.trackerLabel} onChange={(v) => update("hero", { trackerLabel: v })} />
          <TextInput label="Button" value={hero.trackerButton} onChange={(v) => update("hero", { trackerButton: v })} />
        </div>
        <TextInput label="Placeholder" value={hero.trackerPlaceholder} onChange={(v) => update("hero", { trackerPlaceholder: v })} />
        <Toggle label="Show demo Project IDs" hint="Turn off before launching to real clients." checked={hero.showDemoIds} onChange={(v) => update("hero", { showDemoIds: v })} />
      </Card>

      <Card title="Technology strip" description="The scrolling list of technologies under the hero. The list itself comes from the Technologies tab.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Title" value={hero.marqueeTitle} onChange={(v) => update("hero", { marqueeTitle: v })} />
          <TextInput label="Subtitle" value={hero.marqueeSubtitle} onChange={(v) => update("hero", { marqueeSubtitle: v })} />
        </div>
      </Card>
    </>
  );
}

function PromotionsTab({ draft, update }: TabProps) {
  const { fliers } = draft;
  const setItems = (items: Flier[]) => update("fliers", { items });
  const patchItem = (id: string, patch: Partial<Flier>) => setItems(fliers.items.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <>
      <Card title="Offers section" description="Shown on the home page between the hero and the courses when at least one flier is active.">
        <Toggle label="Show offers section" checked={fliers.enabled} onChange={(v) => update("fliers", { enabled: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Title" value={fliers.title} onChange={(v) => update("fliers", { title: v })} />
          <TextInput label="Subtitle" value={fliers.subtitle} onChange={(v) => update("fliers", { subtitle: v })} />
        </div>
      </Card>

      {fliers.items.map((f, i) => (
        <Card
          key={f.id}
          title={f.title || `Flier ${i + 1}`}
          description={f.enabled ? "Active" : "Hidden"}
          action={
            <div className="flex gap-1.5">
              <button
                onClick={() => patchItem(f.id, { enabled: !f.enabled })}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold", f.enabled ? "bg-teal-soft text-teal-700" : "bg-mist text-muted")}
              >
                {f.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {f.enabled ? "Active" : "Hidden"}
              </button>
              <button onClick={() => setItems(fliers.items.filter((x) => x.id !== f.id))} aria-label="Delete flier" className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          }
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <ImagePicker label="Flier image" value={f.imageId} onChange={(imageId) => patchItem(f.id, { imageId })} />
            <div className="space-y-4">
              <TextInput label="Title" value={f.title} onChange={(v) => patchItem(f.id, { title: v })} />
              <TextArea label="Text" value={f.text} onChange={(v) => patchItem(f.id, { text: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Button label" value={f.ctaLabel} onChange={(v) => patchItem(f.id, { ctaLabel: v })} />
                <TextInput label="Button link" value={f.ctaHref} onChange={(v) => patchItem(f.id, { ctaHref: v })} placeholder="#courses or https://…" />
              </div>
            </div>
          </div>
        </Card>
      ))}

      <button
        onClick={() =>
          setItems([
            ...fliers.items,
            { id: `flier_${Date.now().toString(36)}`, enabled: true, title: "New offer", text: "", ctaLabel: "Learn more", ctaHref: "#courses" },
          ])
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white font-bold text-muted transition hover:border-brand/40 hover:text-navy"
      >
        <Plus className="size-5" /> Add flier
      </button>
    </>
  );
}

function PortalTab({ draft, update }: TabProps) {
  const { portal } = draft;
  return (
    <>
      <Card title="Tech stack panel" description="The dark “What your app is built with” panel clients see on their project page.">
        <TextInput label="Title" value={portal.stackTitle} onChange={(v) => update("portal", { stackTitle: v })} />
        <TextInput label="Subtitle" value={portal.stackSubtitle} onChange={(v) => update("portal", { stackSubtitle: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Discount label" value={portal.discountLabel} onChange={(v) => update("portal", { discountLabel: v })} />
          <TextInput label="Message after enrolling" value={portal.counsellorPromise} onChange={(v) => update("portal", { counsellorPromise: v })} />
        </div>
      </Card>
      <Card title="Support plans" description="Offered to clients when they sign off their handover.">
        <TextInput label="Title" value={draft.supportPlans.title} onChange={(v) => update("supportPlans", { title: v })} />
        <TextInput label="Subtitle" value={draft.supportPlans.subtitle} onChange={(v) => update("supportPlans", { subtitle: v })} />
        {draft.supportPlans.plans.map((plan, i) => {
          const setPlan = (patch: Partial<typeof plan>) => update("supportPlans", { plans: draft.supportPlans.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
          return (
            <div key={plan.id} className="space-y-3 rounded-xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.7fr_0.8fr]">
                <TextInput label="Plan name" value={plan.name} onChange={(v) => setPlan({ name: v })} />
                <TextInput label="Price" type="number" value={String(plan.price)} onChange={(v) => setPlan({ price: Number(v) || 0 })} />
                <TextInput label="Currency" value={plan.currency} onChange={(v) => setPlan({ currency: v.toUpperCase().slice(0, 3) })} />
                <TextInput label="Per" value={plan.period} placeholder="month" onChange={(v) => setPlan({ period: v })} />
              </div>
              <TextInput label="Description" value={plan.description} onChange={(v) => setPlan({ description: v })} />
              <StringList label="Included" items={plan.features} onChange={(features) => setPlan({ features })} />
              {draft.supportPlans.plans.length > 1 && (
                <button type="button" onClick={() => update("supportPlans", { plans: draft.supportPlans.plans.filter((_, j) => j !== i) })} className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-danger">
                  <Trash2 className="size-3.5" /> Remove plan
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => update("supportPlans", { plans: [...draft.supportPlans.plans, { id: `plan_${Date.now().toString(36)}`, name: "New plan", price: 0, currency: "NGN", period: "month", description: "", features: [] }] })}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line font-bold text-muted hover:border-brand/40 hover:text-navy"
        >
          <Plus className="size-4" /> Add support plan
        </button>
      </Card>
      <Card title="Stage explanations" description="Plain-language text clients see for each project stage. Also used in stage-change updates and emails.">
        {(Object.keys(STAGES) as StageKey[]).map((k) => (
          <TextArea
            key={k}
            label={STAGES[k].label}
            rows={2}
            value={portal.stageMeanings[k] ?? ""}
            onChange={(v) => update("portal", { stageMeanings: { ...portal.stageMeanings, [k]: v } })}
          />
        ))}
      </Card>
    </>
  );
}

function IdeaFormTab({ draft, update }: TabProps) {
  const { ideaForm } = draft;
  return (
    <>
      <Card title="Submit your idea form">
        <TextInput label="Intro under the form title" value={ideaForm.intro} onChange={(v) => update("ideaForm", { intro: v })} />
        <TextInput label="Promised response time" hint="Shown after submitting, e.g. “2 working days”." value={ideaForm.responseTime} onChange={(v) => update("ideaForm", { responseTime: v })} />
      </Card>
      <Card title="Form options">
        <div className="grid gap-6 lg:grid-cols-2">
          <StringList label="Categories" items={ideaForm.categories} onChange={(categories) => update("ideaForm", { categories })} />
          <StringList label="What should we build? (platforms)" items={ideaForm.platforms} onChange={(platforms) => update("ideaForm", { platforms })} />
          <StringList label="Budget ranges" items={ideaForm.budgets} onChange={(budgets) => update("ideaForm", { budgets })} />
          <StringList label="Timelines" items={ideaForm.timelines} onChange={(timelines) => update("ideaForm", { timelines })} />
        </div>
      </Card>
    </>
  );
}

function PaymentsTab({ draft, update }: TabProps) {
  const pay = draft.payments;
  return (
    <Card title="Commitment fee wording" description="What clients read on the wallet step. The amount, bank account and Paystack keys live under Settings.">
      <TextInput label="Wallet step title" value={pay.feeTitle} onChange={(v) => update("payments", { feeTitle: v })} />
      <TextArea label="Why we charge it" rows={2} value={pay.feeExplainer} onChange={(v) => update("payments", { feeExplainer: v })} />
      <TextArea label="Bank transfer instructions" rows={2} value={pay.transferInstructions} onChange={(v) => update("payments", { transferInstructions: v })} />
      <TextInput label="How long confirming a transfer takes" value={pay.confirmationTime} onChange={(v) => update("payments", { confirmationTime: v })} hint="Shown as “we confirm transfers within …”." />
    </Card>
  );
}

function FooterTab({ draft, update }: TabProps) {
  const { footer } = draft;
  const setColumns = (columns: SiteContent["footer"]["columns"]) => update("footer", { columns });
  return (
    <>
      <Card title="Call to action band">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Small heading" value={footer.ctaEyebrow} onChange={(v) => update("footer", { ctaEyebrow: v })} />
          <TextInput label="Button" value={footer.ctaButton} onChange={(v) => update("footer", { ctaButton: v })} />
        </div>
        <TextInput label="Title" value={footer.ctaTitle} onChange={(v) => update("footer", { ctaTitle: v })} />
        <TextArea label="Text" rows={2} value={footer.ctaText} onChange={(v) => update("footer", { ctaText: v })} />
      </Card>

      <Card title="Contact details">
        <TextArea label="About text" rows={2} value={footer.about} onChange={(v) => update("footer", { about: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Email" type="email" value={footer.email} onChange={(v) => update("footer", { email: v })} />
          <TextInput label="Phone" value={footer.phone} onChange={(v) => update("footer", { phone: v })} />
        </div>
        <TextInput label="Address / location" value={footer.address} onChange={(v) => update("footer", { address: v })} />
      </Card>

      {footer.columns.map((col, i) => (
        <Card
          key={i}
          title={col.title || `Column ${i + 1}`}
          action={
            <button onClick={() => setColumns(footer.columns.filter((_, j) => j !== i))} aria-label="Delete column" className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          }
        >
          <TextInput label="Column title" value={col.title} onChange={(v) => setColumns(footer.columns.map((c, j) => (j === i ? { ...c, title: v } : c)))} />
          <LinkList label="Links" items={col.links} onChange={(links) => setColumns(footer.columns.map((c, j) => (j === i ? { ...c, links } : c)))} />
        </Card>
      ))}
      {footer.columns.length < 4 && (
        <button
          onClick={() => setColumns([...footer.columns, { title: "New column", links: [] }])}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white font-bold text-muted transition hover:border-brand/40 hover:text-navy"
        >
          <Plus className="size-5" /> Add footer column
        </button>
      )}

      <Card title="Bottom bar">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Large background wordmark" value={footer.wordmark} onChange={(v) => update("footer", { wordmark: v })} />
          <TextInput label="Copyright text" hint="The current year is added automatically." value={footer.copyright} onChange={(v) => update("footer", { copyright: v })} />
        </div>
        <TextInput label="Security note" value={footer.securityNote} onChange={(v) => update("footer", { securityNote: v })} />
      </Card>
    </>
  );
}
