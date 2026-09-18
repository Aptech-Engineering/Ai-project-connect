"use client";

/**
 * File helpers. Files themselves live on the server: uploads go out as multipart
 * and downloads come from the API, so nothing is kept in the browser.
 */
import { apiUrl } from "./api";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const PDF_TYPES = ["application/pdf"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PROOF_TYPES = [...PDF_TYPES, "image/jpeg", "image/png"];

/** A file the server holds, as returned by the API. */
export interface RemoteFile {
  id: string | number;
  name: string;
  size?: number;
  url?: string;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Checks the file really starts with %PDF, not just that it's named .pdf. */
export async function validatePdf(file: File): Promise<string | null> {
  if (!PDF_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) return "Please upload a PDF file.";
  if (file.size > MAX_PDF_BYTES) return "That file is larger than 10 MB. Please upload a smaller PDF.";
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const magic = String.fromCharCode(...header);
  return magic.startsWith("%PDF") ? null : "That doesn't look like a real PDF. Please export it again and retry.";
}

export function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Images must be 5 MB or smaller.";
  return null;
}

/** Proof of payment: a PDF or a photo of the receipt. */
export function validateProof(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Use a PDF, JPG or PNG file.";
  if (file.size > MAX_PROOF_BYTES) return "Files must be 5 MB or smaller.";
  return null;
}

/**
 * Absolute URL for a file the API serves. The API hands out paths that already
 * start with /api (e.g. /api/staff/files/abc), so that prefix is dropped before
 * the configured base is added — otherwise local runs would ask for /api/api/…
 */
export function fileUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return apiUrl(path.replace(/^\/api(?=\/)/, ""));
}

export const publicImageUrl = (id?: string | null) => (id ? apiUrl(`/files/${id}`) : undefined);

/**
 * Opens a file the API serves. Session cookies travel with the request, so the
 * file is fetched first and then shown or saved from a blob URL.
 */
export async function openRemoteFile(path: string, name: string, mode: "view" | "download" = "view"): Promise<boolean> {
  try {
    const src = fileUrl(path);
    const res = await fetch(src + (mode === "download" ? (src.includes("?") ? "&" : "?") + "download=1" : ""), { credentials: "include" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (mode === "view") {
      const win = window.open(url, "_blank", "noopener");
      if (!win) return false;
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}
