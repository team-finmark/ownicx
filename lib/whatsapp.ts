import "server-only";
import { randomBytes } from "node:crypto";
import * as db from "./db";
import { open } from "./secret-box";
import type { WhatsAppConnection } from "./types";

// The salon's WhatsApp connection is configured in Settings → WhatsApp and stored in the
// `whatsapp_connection` table. Two delivery modes:
//  - click_to_chat (default, ₹0): messages queue with wa.me links; the front desk taps Send in the Outbox.
//  - cloud_api: sends automatically through Meta's WhatsApp Cloud API once the number is connected
//    (Continue with Facebook, or manual credentials). Free-form text only delivers inside a guest's
//    24-hour reply window; reminders outside it need a Meta-approved template.

export type WhatsAppMode = "click_to_chat" | "cloud_api";
export const GRAPH = "https://graph.facebook.com/v21.0";

export function newVerifyToken() {
  return randomBytes(18).toString("hex");
}

function blank(phone: string): WhatsAppConnection {
  return {
    id: "default",
    mode: "click_to_chat",
    phone,
    phone_confirmed: false,
    status: "not_connected",
    connected_via: null,
    phone_number_id: null,
    waba_id: null,
    access_token_enc: null,
    app_secret_enc: null,
    webhook_verify_token: newVerifyToken(),
    verified_name: null,
    display_phone: null,
    last_error: null,
    connected_at: null,
  };
}

/** The connection row, created on first use. */
export async function getConnection(): Promise<WhatsAppConnection> {
  const row = await db.get("whatsapp_connection", "default");
  if (row) return row;
  const created = blank((await db.getSettings()).whatsapp_number ?? "");
  await db.insert("whatsapp_connection", created);
  return created;
}

export async function saveConnection(patch: Partial<WhatsAppConnection>) {
  await getConnection();
  await db.update("whatsapp_connection", "default", patch);
}

export interface CloudCreds {
  phoneNumberId: string;
  token: string;
}

/** Credentials for automatic sending, or null when not connected (or undecryptable). */
export function cloudCreds(c: WhatsAppConnection): CloudCreds | null {
  if (c.mode !== "cloud_api" || c.status !== "connected" || !c.phone_number_id) return null;
  const token = open(c.access_token_enc);
  return token ? { phoneNumberId: c.phone_number_id, token } : null;
}

/** Secret Meta signs webhooks with: the salon's own app (manual) or Osiq's platform app (Facebook sign-in). */
export function webhookAppSecret(c: WhatsAppConnection): string | null {
  return c.connected_via === "facebook" ? process.env.META_APP_SECRET ?? null : open(c.app_secret_enc);
}

export async function whatsappMode(): Promise<WhatsAppMode> {
  return cloudCreds(await getConnection()) ? "cloud_api" : "click_to_chat";
}

export function waLink(phone: string, body: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;
}

type SendResult = { ok: true } | { ok: false; error: string };

async function graphError(res: Response) {
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  return { code: json.error?.code, message: json.error?.message ?? `HTTP ${res.status}` };
}

export interface FilledTemplate {
  name: string;
  language: string;
  values: string[];
}

/**
 * Sends free-form text, or a Meta-approved template when one is set. Business-initiated messages
 * outside the guest's 24-hour reply window only deliver as templates.
 */
export async function sendViaCloudApi(phone: string, body: string, creds?: CloudCreds | null, template?: FilledTemplate | null): Promise<SendResult> {
  const c = creds ?? cloudCreds(await getConnection());
  if (!c) return { ok: false, error: "WhatsApp isn't connected for automatic sending (Settings → WhatsApp)" };
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          ...(template.values.length ? { components: [{ type: "body", parameters: template.values.map((text) => ({ type: "text", text: text || "-" })) }] } : {}),
        },
      }
    : { messaging_product: "whatsapp", to: phone, type: "text", text: { body, preview_url: true } };
  const res = await fetch(`${GRAPH}/${c.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  const e = await graphError(res);
  if (e.code === 131047) return { ok: false, error: "Outside the 24-hour window — add an approved Meta template to this rule/campaign (the tap-to-send link still works)" };
  if (e.code === 132001) return { ok: false, error: `Meta has no approved template "${template?.name}" in language "${template?.language}"` };
  if (e.code === 132000) return { ok: false, error: `Template "${template?.name}" expects a different number of variables` };
  return { ok: false, error: e.message };
}

/** Fills a template's {{1}}, {{2}}… from the same variables the message text uses. */
export function fillTemplate(t: { name: string; language: string; params: string[] } | null | undefined, vars: Record<string, string | number>): FilledTemplate | null {
  if (!t?.name) return null;
  return { name: t.name, language: t.language || "en", values: t.params.map((p) => String(vars[p] ?? "")) };
}

/** Meta's pre-approved `hello_world` template: works outside the 24h window, so it's the reliable connection test. */
export async function sendTestTemplate(phone: string, creds: CloudCreds): Promise<SendResult> {
  const res = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: "hello_world", language: { code: "en_US" } } }),
  });
  return res.ok ? { ok: true } : { ok: false, error: (await graphError(res)).message };
}

/** Looks up the number behind a Phone Number ID. This is what proves the manager owns the number. */
export async function fetchPhoneInfo(phoneNumberId: string, token: string) {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error((await graphError(res)).message);
  return (await res.json()) as { display_phone_number: string; verified_name: string; quality_rating?: string };
}

// ---- Continue with Facebook (Meta Embedded Signup) ----
// Needs Osiq's Meta app (META_APP_ID, META_APP_SECRET, META_CONFIG_ID) — set once for the platform, not per salon.

export function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  return appId && configId && process.env.META_APP_SECRET ? { appId, configId } : null;
}

export async function exchangeSignupCode(code: string): Promise<string> {
  const u = new URL(`${GRAPH}/oauth/access_token`);
  u.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  u.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  u.searchParams.set("code", code);
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`Facebook sign-in failed: ${(await graphError(res)).message}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function registerNumber(phoneNumberId: string, token: string, pin: string) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  // Already-registered numbers return an error we can ignore; anything else is surfaced.
  if (!res.ok) {
    const e = await graphError(res);
    if (!/already registered/i.test(e.message)) throw new Error(`Couldn't register the number: ${e.message}`);
  }
}

export async function subscribeWaba(wabaId: string, token: string) {
  const res = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Couldn't subscribe to messages: ${(await graphError(res)).message}`);
}
