"use client";

/**
 * Thin client for the PHP API in backend/.
 *
 * Sessions are HttpOnly cookies, so every request goes out with credentials and
 * the X-Requested-With header the server's CSRF check expects.
 */

/** Same-origin in production (public_html/api); set NEXT_PUBLIC_API_BASE for a separate dev server. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string>;
  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
  /** The first field message, falling back to the general one. */
  get first() {
    return Object.values(this.errors)[0] ?? this.message;
  }
}

type SessionKind = "client" | "staff";

const listeners = new Set<(kind: SessionKind) => void>();

/** Called when the server says a session has ended, so the UI can sign out. */
export function onSessionExpired(fn: (kind: SessionKind) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * "Who am I?" answers 401 whenever nobody is signed in, which is normal for a
 * visitor. Only a 401 on a real request means a session ended under someone.
 */
const PROBES = ["/client/me", "/staff/me"];

function sessionExpired(path: string) {
  if (PROBES.some((p) => path.split("?")[0] === p)) return;
  const kind: SessionKind = path.startsWith("/staff") || path.startsWith("/admin") ? "staff" : "client";
  listeners.forEach((fn) => fn(kind));
}

export function apiUrl(path: string) {
  return path.startsWith("http") ? path : API_BASE + path;
}

async function parse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // An HTML error page from the web server rather than the API.
    throw new ApiError(res.status, res.ok ? "The server sent something we couldn't read." : `Server error (${res.status}).`);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, headers, body: payload, credentials: "include", signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.");
  }

  const data = await parse(res);
  if (res.ok) return data as T;
  if (res.status === 401) sessionExpired(path);
  const message = (data as { error?: string })?.error || defaultMessage(res.status);
  throw new ApiError(res.status, message, ((data as { errors?: Record<string, string> })?.errors) ?? {});
}

function defaultMessage(status: number) {
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong. Please try again.";
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

/** Builds a query string, skipping empty values. */
export function query(params: Record<string, string | number | boolean | undefined | null> | object) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Multipart body from plain fields; arrays are sent as JSON, undefined is skipped. */
export function formData(fields: Record<string, string | number | boolean | string[] | Blob | File | undefined | null>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) fd.append(key, value);
    else if (Array.isArray(value)) fd.append(key, JSON.stringify(value));
    else fd.append(key, String(value));
  }
  return fd;
}

/** Turns any thrown value into something we can show a person. */
export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.first;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Please try again.";
}
