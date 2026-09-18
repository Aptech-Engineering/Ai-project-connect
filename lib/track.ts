"use client";

/**
 * First-party analytics tracker (spec: docs/analytics, section 7).
 *
 * Records anonymous events and sends them in small batches to POST /api/track.
 * No names, emails, Project IDs, idea references or IPs ever leave here, and the
 * private link parameters (resume tokens, quote tokens, reset links…) are stripped
 * from every path before it is sent.
 *
 * Off when the visitor has Do Not Track or Global Privacy Control on, or has opted out.
 */
import { apiUrl } from "./api";

export type TrackEvent =
  | "page_view"
  | "cta_click"
  | "tracker_search"
  | "portal_signin"
  | "idea_form"
  | "payment"
  | "course_view"
  | "course_click"
  | "quote"
  | "download"
  | "outbound_click"
  | "scroll_depth"
  | "client_error";

type Props = Record<string, string | number | boolean | null | undefined>;

interface QueuedEvent {
  event: TrackEvent;
  name: string | null;
  path: string;
  title?: string;
  props?: Props;
  at: string;
}

const VISITOR_COOKIE = "apc_vid";
const VISITOR_KEY = "apc-vid";
const SESSION_KEY = "apc-session";
const OPT_OUT_KEY = "apc-analytics-optout";
const IDLE_MS = 30 * 60 * 1000;
const BATCH_SIZE = 20;
const FLUSH_MS = 5000;

/** Query parameters that are private links and must never be recorded. */
const PRIVATE_PARAMS = ["resume", "token", "reset", "reference", "ref", "code", "email"];

let queue: QueuedEvent[] = [];
let timer: number | null = null;
let started = false;
let sessionFirstBatch = false;
let utm: Record<string, string> | undefined;

/* ---------------- consent ---------------- */

export function trackingAllowed() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (nav.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl) return false;
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === "1") return false;
  } catch {
    /* storage blocked: still fine to track anonymously */
  }
  return true;
}

/** The cookie-notice switch. Turning it off also drops anything not yet sent. */
export function setTrackingOptOut(optOut: boolean) {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignore */
  }
  if (optOut) queue = [];
}

/* ---------------- identifiers ---------------- */

function uuid() {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // Older browsers on plain http: build a v4 UUID by hand.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function visitorId() {
  const fromCookie = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  let id = fromCookie;
  if (!id) {
    try {
      id = localStorage.getItem(VISITOR_KEY) ?? undefined;
    } catch {
      /* ignore */
    }
  }
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) id = uuid();
  // Renewed on every visit, kept for 13 months.
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${VISITOR_COOKIE}=${id}; Max-Age=${60 * 60 * 24 * 395}; Path=/; SameSite=Lax${secure}`;
  try {
    localStorage.setItem(VISITOR_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** Today's date in Lagos, so a session never crosses midnight there. */
const lagosDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

function sessionId() {
  const now = Date.now();
  let session: { id: string; last: number; day: string } | null = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    session = null;
  }
  if (!session || now - session.last > IDLE_MS || session.day !== lagosDay()) {
    session = { id: uuid(), last: now, day: lagosDay() };
    sessionFirstBatch = true;
  }
  session.last = now;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
  return session.id;
}

/* ---------------- cleaning ---------------- */

/** Path + safe query string. Private link parameters are removed. */
export function cleanPath(href: string = location.href) {
  try {
    const url = new URL(href, location.origin);
    for (const p of PRIVATE_PARAMS) url.searchParams.delete(p);
    const search = url.searchParams.toString();
    return (url.pathname.replace(/\/+$/, "") || "/") + (search ? `?${search}` : "");
  } catch {
    return "/";
  }
}

function cleanReferrer() {
  if (!document.referrer) return undefined;
  try {
    const ref = new URL(document.referrer);
    if (ref.host === location.host) return undefined;
    for (const p of PRIVATE_PARAMS) ref.searchParams.delete(p);
    return ref.origin + ref.pathname;
  } catch {
    return undefined;
  }
}

function readUtm() {
  const params = new URLSearchParams(location.search);
  const found: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = params.get(`utm_${k}`);
    if (v) found[k] = v.slice(0, 120);
  }
  return Object.keys(found).length ? found : undefined;
}

/* ---------------- sending ---------------- */

function flush(useBeacon = false) {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || !trackingAllowed()) {
    queue = [];
    return;
  }
  const events = queue.splice(0, BATCH_SIZE);
  const payload: Record<string, unknown> = { visitorId: visitorId(), sessionId: sessionId(), events };
  if (sessionFirstBatch) {
    payload.referrer = cleanReferrer();
    payload.utm = utm;
    payload.screen = { w: window.screen.width, h: window.screen.height };
    sessionFirstBatch = false;
  }
  // text/plain keeps this a "simple" request, which sendBeacon needs across origins.
  const body = JSON.stringify(payload);
  const url = apiUrl("/track");
  let sent = false;
  if (useBeacon && "sendBeacon" in navigator) {
    sent = navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" }));
  }
  if (!sent) {
    fetch(url, { method: "POST", body, keepalive: true, credentials: "include", headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {
      /* analytics must never break the page */
    });
  }
  if (queue.length) flush(useBeacon);
}

function schedule() {
  if (queue.length >= BATCH_SIZE) return flush();
  if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_MS);
}

/** Records one event. Safe to call anywhere; it does nothing on the server or when tracking is off. */
export function track(event: TrackEvent, name?: string | null, props?: Props) {
  if (typeof window === "undefined" || !trackingAllowed()) return;
  const clean: Props | undefined = props ? Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== "")) : undefined;
  queue.push({
    event,
    name: name ?? null,
    path: cleanPath(),
    title: event === "page_view" ? document.title.slice(0, 120) : undefined,
    props: clean && Object.keys(clean).length ? clean : undefined,
    at: new Date().toISOString(),
  });
  schedule();
}

/* ---------------- automatic events ---------------- */

let lastPath = "";
let scrollMarks = new Set<number>();

/** Call on every route or `?view=` change. */
export function trackPageView() {
  const path = cleanPath();
  if (path === lastPath) return;
  lastPath = path;
  scrollMarks = new Set();
  track("page_view");
}

function onClick(e: MouseEvent) {
  const target = e.target as Element | null;
  const tagged = target?.closest?.("[data-track]");
  if (tagged) track("cta_click", tagged.getAttribute("data-track"));

  const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (link) {
    try {
      const url = new URL(link.href, location.href);
      if (/^https?:$/.test(url.protocol) && url.host !== location.host && !url.href.startsWith(apiUrl(""))) {
        track("outbound_click", null, { host: url.host });
      }
    } catch {
      /* ignore */
    }
  }
}

function onScroll() {
  // Only the home page reports scroll depth (spec 6.2).
  if (location.pathname !== "/" && location.pathname !== "") return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return;
  const pct = (window.scrollY / max) * 100;
  for (const mark of [25, 50, 75, 100]) {
    if (pct >= mark - 1 && !scrollMarks.has(mark)) {
      scrollMarks.add(mark);
      track("scroll_depth", null, { depth: mark });
    }
  }
}

function onError(e: ErrorEvent | PromiseRejectionEvent) {
  // A code only — messages can contain personal data.
  const code = "reason" in e ? "unhandled_rejection" : (e.error?.name as string | undefined) ?? "error";
  track("client_error", null, { code: String(code).slice(0, 40) });
}

/** Starts the automatic listeners once per page load. */
export function startTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  utm = readUtm();
  document.addEventListener("click", onClick, { capture: true, passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);
  // Send what's left when the page goes away.
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}
