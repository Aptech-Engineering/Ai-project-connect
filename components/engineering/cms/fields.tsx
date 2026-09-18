"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import StoredImage from "../../StoredImage";
import { saveFile, validateImage } from "@/lib/files";
import { cn } from "@/lib/format";
import type { LinkItem } from "@/lib/content";

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 text-sm text-navy outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

export function Card({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className={cn(inputClass, "h-11")} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputClass, "resize-y py-2.5 leading-relaxed")} />
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-mist/70 px-4 py-3">
      <div>
        <p id={id} className="text-sm font-bold">
          {label}
        </p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-teal" : "bg-line")}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={cn("absolute top-1 size-4 rounded-full bg-white shadow", checked ? "right-1" : "left-1")} />
      </button>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RowActions({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-mist hover:text-navy disabled:opacity-30">
        <ArrowUp className="size-4" />
      </button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(index + 1)} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-mist hover:text-navy disabled:opacity-30">
        <ArrowDown className="size-4" />
      </button>
      <button type="button" onClick={onRemove} aria-label="Remove" className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function StringList({ label, items, onChange, hint, placeholder = "New item" }: { label: string; items: string[]; onChange: (v: string[]) => void; hint?: string; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint}>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <motion.li key={`${i}-${items.length}`} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
              <input value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${label} ${i + 1}`} className={cn(inputClass, "h-10")} />
              <RowActions index={i} length={items.length} onMove={(to) => onChange(move(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
          className={cn(inputClass, "h-10")}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-navy px-3 text-sm font-bold text-white disabled:opacity-40">
          <Plus className="size-4" /> Add
        </button>
      </div>
    </Field>
  );
}

export function LinkList({ label, items, onChange, hint }: { label: string; items: LinkItem[]; onChange: (v: LinkItem[]) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint ?? "Links can be a full URL (https://…), a section like #courses, or #submit-idea to open the idea form."}>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-line p-2 sm:flex-row sm:items-center">
            <input value={item.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" aria-label="Link label" className={cn(inputClass, "h-10 sm:w-2/5")} />
            <input value={item.href} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} placeholder="#section or https://…" aria-label="Link destination" className={cn(inputClass, "h-10 font-mono text-xs")} />
            <RowActions index={i} length={items.length} onMove={(to) => onChange(move(items, i, to))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...items, { label: "New link", href: "#" }])}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-bold text-muted transition hover:border-navy/30 hover:text-navy"
      >
        <Plus className="size-4" /> Add link
      </button>
    </Field>
  );
}

export function ImagePicker({ label, value, onChange, hint }: { label: string; value?: string; onChange: (id: string | undefined) => void; hint?: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file?: File) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const meta = await saveFile(file);
      onChange(meta.id);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} hint={hint ?? "PNG, JPG, WebP or GIF · max 5 MB"} id={id}>
      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-line bg-mist">
          <StoredImage id={value} alt={label} className="max-h-64 w-full object-contain" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <label htmlFor={id} className="cursor-pointer rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold shadow hover:bg-white">
              Replace
            </label>
            <button type="button" onClick={() => onChange(undefined)} aria-label="Remove image" className="rounded-full bg-white/95 p-1.5 text-danger shadow hover:bg-white">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center transition hover:border-brand/50 hover:bg-mist/60"
        >
          {busy ? <Loader2 className="size-6 animate-spin text-brand" /> : <ImagePlus className="size-6 text-brand" />}
          <span className="text-sm font-bold">{busy ? "Uploading…" : "Drop an image or click to upload"}</span>
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-xs font-bold text-danger">{error}</p>}
    </Field>
  );
}
