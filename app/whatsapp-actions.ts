"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "./actions";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { normalisePhone } from "@/lib/engine";
import { userMessage } from "@/lib/errors";
import { seal } from "@/lib/secret-box";
import {
  cloudCreds,
  embeddedSignupConfig,
  exchangeSignupCode,
  fetchPhoneInfo,
  getConnection,
  newVerifyToken,
  registerNumber,
  saveConnection,
  sendTestTemplate,
  subscribeWaba,
} from "@/lib/whatsapp";

const refresh = () => revalidatePath("/", "layout");
const digits = (s: string) => s.replace(/\D/g, "");

async function attempt(fn: () => Promise<string>): Promise<ActionState> {
  await requireManager();
  try {
    const message = await fn();
    refresh();
    return { ok: true, message };
  } catch (e) {
    refresh();
    return { ok: false, message: userMessage(e) };
  }
}

/** Step 1: the salon's WhatsApp number. Changing it resets confirmation (and any automatic connection). */
export async function saveNumber(_: ActionState, f: FormData): Promise<ActionState> {
  return attempt(async () => {
    const phone = normalisePhone(String(f.get("phone") ?? ""));
    if (!/^\d{10,15}$/.test(phone)) throw new Error("Enter the full WhatsApp number with country code, e.g. 98xxxxxxxx or 91 98xxxxxxxx");
    const conn = await getConnection();
    const changed = conn.phone !== phone;
    await saveConnection(
      changed
        ? { phone, phone_confirmed: false, ...(conn.status === "connected" ? { status: "error" as const, last_error: "Number changed — reconnect to verify the new number with Meta" } : {}) }
        : { phone },
    );
    await db.update("settings", "default", { whatsapp_number: phone });
    return changed ? `Saved +${phone}. Open the chat to check it, then confirm.` : "Number saved";
  });
}

/** Step 1b (tap-to-send): manager confirms the number opens the salon's WhatsApp. */
export async function confirmNumber(): Promise<ActionState> {
  return attempt(async () => {
    const conn = await getConnection();
    if (!conn.phone) throw new Error("Save the number first");
    await saveConnection({ phone_confirmed: true });
    return "Number confirmed";
  });
}

/** Step 2: sending mode. Automatic only takes effect once the number is connected (step 3). */
export async function setMode(mode: "click_to_chat" | "cloud_api"): Promise<ActionState> {
  return attempt(async () => {
    if (mode !== "click_to_chat" && mode !== "cloud_api") throw new Error("Unknown sending mode");
    await saveConnection({ mode });
    return mode === "cloud_api" ? "Automatic sending selected — finish step 3 to connect" : "Tap-to-send selected";
  });
}

/** Verifies credentials against Meta and checks the Meta number is the salon's number. */
async function verifyAndStore(opts: { phoneNumberId: string; token: string; wabaId: string | null; via: "manual" | "facebook"; appSecret?: string }) {
  const conn = await getConnection();
  let info;
  try {
    info = await fetchPhoneInfo(opts.phoneNumberId, opts.token);
  } catch (e) {
    await saveConnection({ status: "error", last_error: e instanceof Error ? e.message : "Meta rejected the credentials" });
    throw new Error(`Meta didn't accept these details: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  const metaPhone = digits(info.display_phone_number);
  if (conn.phone && metaPhone !== conn.phone) {
    const msg = `This Meta account's number is +${metaPhone}, but your saved number is +${conn.phone}. Update step 1 or connect the right number.`;
    await saveConnection({ status: "error", last_error: msg });
    throw new Error(msg);
  }
  await saveConnection({
    mode: "cloud_api",
    phone: metaPhone,
    phone_confirmed: true,
    status: "connected",
    connected_via: opts.via,
    phone_number_id: opts.phoneNumberId,
    waba_id: opts.wabaId,
    access_token_enc: seal(opts.token),
    app_secret_enc: opts.appSecret ? seal(opts.appSecret) : null,
    verified_name: info.verified_name,
    display_phone: info.display_phone_number,
    last_error: null,
    connected_at: new Date().toISOString(),
  });
  await db.update("settings", "default", { whatsapp_number: metaPhone });
  return info;
}

/** Step 3 (manual): Phone Number ID + permanent access token + app secret from the salon's own Meta app. */
export async function connectManual(_: ActionState, f: FormData): Promise<ActionState> {
  return attempt(async () => {
    const phoneNumberId = String(f.get("phone_number_id") ?? "").trim();
    const token = String(f.get("access_token") ?? "").trim();
    const appSecret = String(f.get("app_secret") ?? "").trim();
    const wabaId = String(f.get("waba_id") ?? "").trim() || null;
    if (!/^\d{6,}$/.test(phoneNumberId)) throw new Error("Phone Number ID is the long number shown in Meta → WhatsApp → API Setup");
    if (token.length < 20) throw new Error("Paste the full access token");
    if (appSecret.length < 16) throw new Error("App secret is needed to verify incoming messages (Meta → App settings → Basic)");
    const info = await verifyAndStore({ phoneNumberId, token, wabaId, via: "manual", appSecret });
    return `Connected ${info.display_phone_number} (${info.verified_name}). Automatic sending is on.`;
  });
}

/** Step 3 (Continue with Facebook): finishes Meta Embedded Signup. */
export async function completeFacebookSignup(input: { code: string; phoneNumberId: string; wabaId: string }): Promise<ActionState> {
  return attempt(async () => {
    if (!embeddedSignupConfig()) throw new Error("Facebook sign-in isn't enabled on this platform yet. Use the manual connection.");
    if (!input.code || !input.phoneNumberId || !input.wabaId) throw new Error("Facebook didn't return a WhatsApp number. Please try again and finish every step.");
    const token = await exchangeSignupCode(input.code);
    // Meta requires a 6-digit two-step verification PIN; the manager must keep it to move or re-register the number.
    const pin = String(randomInt(100000, 999999));
    await registerNumber(input.phoneNumberId, token, pin);
    await subscribeWaba(input.wabaId, token);
    const info = await verifyAndStore({ phoneNumberId: input.phoneNumberId, token, wabaId: input.wabaId, via: "facebook" });
    return `Connected ${info.display_phone_number} (${info.verified_name}) with Facebook. Automatic sending is on. Write down your WhatsApp two-step PIN: ${pin} — it isn't shown again and is needed to move this number later.`;
  });
}

/** Re-checks a saved connection against Meta (token expired? number removed?). */
export async function recheckConnection(_: ActionState): Promise<ActionState> {
  return attempt(async () => {
    const conn = await getConnection();
    const creds = cloudCreds({ ...conn, status: "connected" });
    if (!creds) throw new Error("Nothing to check yet — connect automatic sending first (or reconnect if SESSION_SECRET changed)");
    try {
      const info = await fetchPhoneInfo(creds.phoneNumberId, creds.token);
      await saveConnection({ status: "connected", last_error: null, verified_name: info.verified_name, display_phone: info.display_phone_number });
      return `All good — ${info.display_phone_number} (${info.verified_name})${info.quality_rating ? ` · quality ${info.quality_rating}` : ""}`;
    } catch (e) {
      await saveConnection({ status: "error", last_error: e instanceof Error ? e.message : "Check failed" });
      throw e;
    }
  });
}

/** Sends Meta's pre-approved hello_world template to a phone the manager owns. */
export async function sendTest(_: ActionState, f: FormData): Promise<ActionState> {
  return attempt(async () => {
    const to = normalisePhone(String(f.get("to") ?? ""));
    if (!/^\d{10,15}$/.test(to)) throw new Error("Enter the phone number to send the test to");
    const creds = cloudCreds(await getConnection());
    if (!creds) throw new Error("Connect automatic sending first");
    const r = await sendTestTemplate(to, creds);
    if (!r.ok) throw new Error(`Meta refused the test: ${r.error}`);
    return `Test sent to +${to}. It arrives as Meta's "Hello World" message.`;
  });
}

export async function regenerateVerifyToken(): Promise<ActionState> {
  return attempt(async () => {
    await saveConnection({ webhook_verify_token: newVerifyToken() });
    return "New verify token made — paste it into Meta";
  });
}

/** Back to free tap-to-send; stored credentials are deleted. */
export async function disconnect(): Promise<ActionState> {
  return attempt(async () => {
    await saveConnection({
      mode: "click_to_chat",
      status: "not_connected",
      connected_via: null,
      phone_number_id: null,
      waba_id: null,
      access_token_enc: null,
      app_secret_enc: null,
      verified_name: null,
      display_phone: null,
      last_error: null,
      connected_at: null,
    });
    return "Disconnected — back to tap-to-send";
  });
}

/** Forgets the salon's number. Automatic sending is tied to the number, so it is disconnected too. */
export async function removeNumber(): Promise<ActionState> {
  return attempt(async () => {
    await saveConnection({
      phone: "",
      phone_confirmed: false,
      mode: "click_to_chat",
      status: "not_connected",
      connected_via: null,
      phone_number_id: null,
      waba_id: null,
      access_token_enc: null,
      app_secret_enc: null,
      verified_name: null,
      display_phone: null,
      last_error: null,
      connected_at: null,
    });
    await db.update("settings", "default", { whatsapp_number: "" });
    return "Number removed";
  });
}
