"use client";

/**
 * Admin settings: payment credentials, bank account and notification providers.
 *
 * Secrets are write-only. The real server encrypts them and never sends them back,
 * so this mock keeps only the last 4 characters and throws the value away — the same
 * shape the API returns ({ set, last4, updatedAt, updatedBy }).
 */
import { createDocument } from "./collection";
import { readSiteContent, useSiteContent } from "./content";
import { logActivity } from "./store";
import type { Person } from "./types";

export interface SecretMeta {
  set: boolean;
  last4?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type PaystackMode = "test" | "live";
export type NotificationDriver = "log" | "mail" | "termii";

export const DEFAULT_SETTINGS = {
  payments: {
    commitmentFee: 2000,
    currency: "NGN",
    paystackEnabled: true,
    manualEnabled: true,
    bankName: "Access Bank",
    accountName: "Aptech Computer Education",
    accountNumber: "0000000000",
  },
  paystack: {
    mode: "test" as PaystackMode,
    testPublicKey: "",
    livePublicKey: "",
    testSecretKey: { set: false } as SecretMeta,
    liveSecretKey: { set: false } as SecretMeta,
  },
  notifications: {
    driver: "log" as NotificationDriver,
    fromEmail: "hello@aiprojectconnect.com",
    fromName: "AI Project Connect",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: { set: false } as SecretMeta,
    termiiApiKey: { set: false } as SecretMeta,
    termiiSenderId: "AptechAPC",
  },
};

export type Settings = typeof DEFAULT_SETTINGS;

const doc = createDocument<Settings>("apc-admin-settings-v1", DEFAULT_SETTINGS);

export const useSettings = () => doc.useDoc();
export const readSettings = () => doc.read();
export const resetSettings = () => doc.reset();

/** Payment settings (admin settings) merged with the client-facing wording (site content). */
export function usePaymentSettings() {
  return { ...useSiteContent().payments, ...useSettings().payments };
}

export function readPaymentSettings() {
  return { ...readSiteContent().payments, ...readSettings().payments };
}

/** Turns a secret into the metadata we keep. The value itself is never stored. */
export function secretMeta(value: string, actor: Person): SecretMeta {
  return { set: true, last4: value.trim().slice(-4), updatedAt: new Date().toISOString(), updatedBy: actor.name };
}

export const KEY_PATTERN = /^(sk|pk)_(test|live)_[A-Za-z0-9]{10,}$/;

/** Checks a Paystack key's shape and that it belongs to the mode it's filed under. */
export function keyProblem(value: string, kind: "sk" | "pk", mode: PaystackMode): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!KEY_PATTERN.test(v)) return `This doesn't look like a Paystack key. They start with ${kind}_${mode}_.`;
  const [prefix, keyMode] = v.split("_");
  if (prefix !== kind) return kind === "sk" ? "That's a public key. Paste the secret key here." : "That's a secret key. Paste the public key here.";
  if (keyMode !== mode) return `That's a ${keyMode} key. Put it in the ${keyMode} fields instead.`;
  return null;
}

export function activeKeys(s: Settings) {
  const live = s.paystack.mode === "live";
  return { publicKey: live ? s.paystack.livePublicKey : s.paystack.testPublicKey, secret: live ? s.paystack.liveSecretKey : s.paystack.testSecretKey };
}

/** Why online payments can't run yet, or null when Paystack is ready. */
export function paystackProblem(s: Settings): string | null {
  if (!s.payments.paystackEnabled) return null;
  const { publicKey, secret } = activeKeys(s);
  const mode = s.paystack.mode;
  if (!secret.set || !publicKey) return `Add your ${mode} Paystack keys in Settings before clients can pay online.`;
  return null;
}

export interface SettingsPatch {
  payments?: Partial<Settings["payments"]>;
  paystack?: Partial<Omit<Settings["paystack"], "testSecretKey" | "liveSecretKey">> & { testSecretKey?: string | null; liveSecretKey?: string | null };
  notifications?: Partial<Omit<Settings["notifications"], "smtpPassword" | "termiiApiKey">> & { smtpPassword?: string | null; termiiApiKey?: string | null };
}

const SECRET_FIELDS = { paystack: ["testSecretKey", "liveSecretKey"], notifications: ["smtpPassword", "termiiApiKey"] } as const;

/**
 * Saves a partial update. A secret given as "" is left as it was, null clears it,
 * and any other string replaces it. Values are never written to the activity log.
 */
export function saveSettings(patch: SettingsPatch, actor: Person): string[] {
  const current = readSettings();
  const next: Settings = { payments: { ...current.payments }, paystack: { ...current.paystack }, notifications: { ...current.notifications } };
  const changed: string[] = [];

  for (const group of ["payments", "paystack", "notifications"] as const) {
    const values = patch[group] as Record<string, unknown> | undefined;
    if (!values) continue;
    const secrets: readonly string[] = group === "payments" ? [] : SECRET_FIELDS[group];
    for (const [key, value] of Object.entries(values)) {
      const target = next[group] as Record<string, unknown>;
      if (secrets.includes(key)) {
        if (value === "" || value === undefined) continue;
        target[key] = value === null ? { set: false } : secretMeta(String(value), actor);
        changed.push(`${group}.${key}`);
        continue;
      }
      if (value === undefined || JSON.stringify(target[key]) === JSON.stringify(value)) continue;
      target[key] = value;
      changed.push(`${group}.${key}`);
    }
  }

  if (changed.length === 0) return [];
  doc.set(next);
  logActivity(actor, `Updated settings: ${changed.join(", ")}`);
  return changed;
}

/** Stands in for the server-side call that verifies the key with Paystack. */
export function testPaystack(): { ok: boolean; message: string } {
  const s = readSettings();
  const { publicKey, secret } = activeKeys(s);
  if (!secret.set) return { ok: false, message: `No ${s.paystack.mode} secret key saved yet.` };
  if (!publicKey) return { ok: false, message: `Add the ${s.paystack.mode} public key too — the checkout needs it.` };
  return { ok: true, message: `Connected to Paystack in ${s.paystack.mode} mode. On the live site this checks the key with Paystack itself.` };
}

export const WEBHOOK_PATH = "/api/payments/paystack/webhook";
