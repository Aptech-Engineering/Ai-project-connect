"use client";

/**
 * Mock file storage. Uploaded files are kept in the browser's IndexedDB
 * (localStorage is too small for PDFs) so staff can open what clients upload.
 * Replace with S3-compatible object storage when the back-end exists.
 */
const DB_NAME = "apc-demo-files";
const STORE = "files";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface StoredFileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function saveFile(file: File): Promise<StoredFileMeta> {
  const id = `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await run("readwrite", (s) => s.put(file, id));
  return { id, name: file.name, size: file.size, type: file.type || "application/pdf" };
}

export function getFile(id: string): Promise<Blob | undefined> {
  return run<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
}

export function deleteFile(id: string) {
  return run("readwrite", (s) => s.delete(id));
}

export function clearFiles() {
  return run("readwrite", (s) => s.clear());
}

/** Opens a stored file in a new tab (view) or saves it (download). Returns false if it no longer exists. */
export async function openStoredFile(id: string, name: string, mode: "view" | "download"): Promise<boolean> {
  const blob = await getFile(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  if (mode === "view") {
    window.open(url, "_blank", "noopener");
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
}

/** Checks the extension, MIME type and the "%PDF" file signature. */
export async function validatePdf(file: File): Promise<string | null> {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) return "Only PDF files are allowed.";
  if (file.size > MAX_PDF_BYTES) return "That file is larger than 10 MB. Please upload a smaller PDF.";
  if (file.size === 0) return "That file is empty.";
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...head) !== "%PDF") return "That file doesn't look like a valid PDF.";
  return null;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return "Use a PNG, JPG, WebP or GIF image.";
  if (file.size > MAX_IMAGE_BYTES) return "Images must be 5 MB or smaller.";
  return null;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
