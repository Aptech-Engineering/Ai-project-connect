"use client";

/**
 * Admin settings: payment credentials, bank account and notification providers.
 *
 * Secrets are write-only. The server encrypts them and only ever returns
 * { set, last4, updatedAt, updatedBy, source }, so nothing here ever holds a key.
 */
import { useMemo } from "react";
import { api } from "./api";
import { invalidate, useApi } from "./remote";
import { readSiteContent, useSiteContent } from "./content";

export interface SecretMeta {
  set: boolean;
  last4?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  source?: "settings" | "config" | "default";
}

export type PaystackMode = "test" | "live";
export type NotificationDriver = "log" | "mail" | "termii";

export interface PaymentSettings {
  commitmentFee: number;
  currency: string;
  paystackEnabled: boolean;
  manualEnabled: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface PaystackSettings {
  mode: PaystackMode;
  testPublicKey: string;
  livePublicKey: string;
  testSecretKey: SecretMeta;
  liveSecretKey: SecretMeta;
  /** Read-only, from the server. */
  callbackUrl?: string;
  webhookUrl?: string;
  liveReady?: boolean;
  fakeMode?: boolean;
}

export interface NotificationSettings {
  driver: NotificationDriver;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpUser: string;
  smtpPassword: SecretMeta;
  termiiApiKey: SecretMeta;
  termiiSenderId: string;
}

export interface Settings {
  payments: PaymentSettings;
  paystack: PaystackSettings;
  notifications: NotificationSettings;
  meta?: { sources?: Record<string, string>; updatedAt?: string | null; encryptionReady?: boolean; warnings?: string[] };
}

const SETTINGS = "/admin/settings";

const NO_SECRET: SecretMeta = { set: false };

/** Used until the settings load, and as the shape components can rely on. */
export const DEFAULT_SETTINGS: Settings = {
  payments: { commitmentFee: 2000, currency: "NGN", paystackEnabled: true, manualEnabled: true, bankName: "", accountName: "", accountNumber: "" },
  paystack: { mode: "test", testPublicKey: "", livePublicKey: "", testSecretKey: NO_SECRET, liveSecretKey: NO_SECRET },
  notifications: { driver: "log", fromEmail: "", fromName: "AI Project Connect", smtpHost: "", smtpPort: 587, smtpUser: "", smtpPassword: NO_SECRET, termiiApiKey: NO_SECRET, termiiSenderId: "" },
};

/** Last payment settings seen, so non-React code can read them synchronously. */
let paymentSnapshot: PaymentSettings = DEFAULT_SETTINGS.payments;

/** Admin only. Anything public should use `application.checkout` from the API instead. */
export function useSettings() {
  const { data, loading, error, refresh } = useApi<Settings>(SETTINGS);
  const settings = data ?? DEFAULT_SETTINGS;
  if (data?.payments) paymentSnapshot = data.payments;
  return { settings, loading, error, refresh };
}

/** Payment settings (admin) merged with the client-facing wording (site content). */
export function usePaymentSettings() {
  const { settings } = useSettings();
  const content = useSiteContent().payments;
  return useMemo(() => ({ ...content, ...settings.payments }), [content, settings.payments]);
}

export function readPaymentSettings() {
  return { ...readSiteContent().payments, ...paymentSnapshot };
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
  if (!secret.set || !publicKey) return `Add your ${s.paystack.mode} Paystack keys in Settings before clients can pay online.`;
  return null;
}

export interface SettingsPatch {
  payments?: Partial<PaymentSettings>;
  paystack?: Partial<Omit<PaystackSettings, "testSecretKey" | "liveSecretKey" | "callbackUrl" | "webhookUrl" | "liveReady" | "fakeMode">> & { testSecretKey?: string | null; liveSecretKey?: string | null };
  notifications?: Partial<Omit<NotificationSettings, "smtpPassword" | "termiiApiKey">> & { smtpPassword?: string | null; termiiApiKey?: string | null };
}

/**
 * Saves a partial update. A secret sent as "" keeps what's stored, null clears it,
 * and any other string replaces it.
 */
export async function saveSettings(patch: SettingsPatch) {
  const saved = await api.put<Settings>(SETTINGS, patch);
  if (saved?.payments) paymentSnapshot = saved.payments;
  await invalidate(SETTINGS, "/content");
  return saved;
}

/** Asks the server to call Paystack with the stored key for the current mode. */
export function testPaystack() {
  return api.post<{ ok: boolean; message: string; mode: PaystackMode; business?: string }>(`${SETTINGS}/paystack/test`);
}

export const WEBHOOK_PATH = "/api/payments/paystack/webhook";
