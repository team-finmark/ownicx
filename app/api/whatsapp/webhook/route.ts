import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api";
import * as db from "@/lib/db";
import { clientIp, gateFail, gateStatus, lockedResponse } from "@/lib/gate";
import { onboardCustomer } from "@/lib/loyalty";
import { cloudCreds, getConnection, sendViaCloudApi, webhookAppSecret } from "@/lib/whatsapp";

// WhatsApp Cloud API webhook. Handles self-serve onboarding and a few keywords:
//   JOIN [referral code]  → enrol with WhatsApp opt-in (name taken from the WhatsApp profile)
//   POINTS                → balance + tier
//   STOP                  → opt out of automated messages

const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function GET(req: Request) {
  const ip = clientIp(req);
  const status = await gateStatus("webhook", ip);
  if (status.locked) return lockedResponse(status);
  const u = new URL(req.url);
  // The verify token is shown (and can be regenerated) in Settings → WhatsApp.
  const conn = await getConnection();
  const token = u.searchParams.get("hub.verify_token") ?? "";
  if (u.searchParams.get("hub.mode") === "subscribe" && conn.webhook_verify_token && sameSecret(token, conn.webhook_verify_token)) {
    // Echo only a plain challenge value (Meta sends digits) — never arbitrary input.
    const challenge = (u.searchParams.get("hub.challenge") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  await gateFail("webhook", ip);
  return new Response("Forbidden", { status: 403 });
}

interface Inbound {
  entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: { id?: string; from: string; type: string; text?: { body: string } }[] } }[] }[];
}

function validSignature(raw: string, header: string | null, secret: string | null) {
  if (!secret) return db.isDemo(); // required outside demo mode
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const status = await gateStatus("webhook", ip);
  if (status.locked) return lockedResponse(status);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
  const conn = await getConnection();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), webhookAppSecret(conn))) {
    await gateFail("webhook", ip);
    return new Response("Bad signature", { status: 401 });
  }
  const creds = cloudCreds(conn);
  let payload: Inbound;
  try {
    payload = JSON.parse(raw) as Inbound;
  } catch {
    return json({ ok: true });
  }

  const settings = await db.getSettings();
  // Meta retries deliveries; each inbound message ID is handled once (the ledger row is the record).
  const ids = (payload.entry ?? []).flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
  const seen = new Set((await db.queryIn("messages", "dedupe_key", ids.map((id) => `inbound:${id}`))).map((m) => m.dedupe_key));
  const markHandled = async (msgId: string | undefined, customerId: string | undefined, text: string) => {
    if (!msgId || !customerId) return true;
    const key = `inbound:${msgId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    try {
      await db.insert("messages", {
        id: db.newId("m"),
        customer_id: customerId,
        rule_id: null,
        campaign_id: null,
        dedupe_key: key,
        body: `↩ ${text.slice(0, 500)}`,
        status: "skipped",
        created_at: new Date().toISOString(),
        sent_at: null,
        error: "Inbound message from the guest",
      });
      return true;
    } catch {
      return false; // unique key already taken by a parallel retry
    }
  };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      for (const msg of v?.messages ?? []) {
        if (msg.type !== "text" || !msg.text) continue;
        if (msg.id && seen.has(`inbound:${msg.id}`)) continue;
        const text = msg.text.body.trim();
        const [cmd, arg] = text.split(/\s+/);
        const profileName = v?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? "Guest";
        const [member] = await db.query("customers", { eq: { phone: msg.from }, limit: 1 });
        let reply: string | null = null;

        switch (cmd.toUpperCase()) {
          case "JOIN":
            if (member) {
              if (!(await markHandled(msg.id, member.id, text))) continue;
              if (!member.whatsapp_opt_in) await db.update("customers", member.id, { whatsapp_opt_in: true });
              reply = `You're already a member, ${member.name.split(" ")[0]} 💛 You have ${member.points} points.`;
            } else {
              try {
                const { customer } = await onboardCustomer({ name: profileName, phone: msg.from, channel: "whatsapp", whatsapp_opt_in: true, referral_code: arg ?? null });
                await markHandled(msg.id, customer.id, text);
                reply = `Welcome to ${settings.salon_name} rewards, ${customer.name.split(" ")[0]}! 🎉 You'll earn points on every visit. Your referral code is ${customer.referral_code}. Share it with friends and earn when they visit. Reply STOP anytime to opt out.`;
              } catch (e) {
                reply = e instanceof Error && e.message.includes("Referral") ? "That referral code didn't match. Send JOIN on its own to sign up." : "Sorry, we couldn't sign you up. Please ask at the front desk.";
              }
            }
            break;
          case "POINTS":
            if (member && !(await markHandled(msg.id, member.id, text))) continue;
            reply = member ? `You have ${member.points} points (${member.lifetime_points} lifetime). Book: ${settings.booking_link}` : "You're not a member yet. Send JOIN to sign up.";
            break;
          case "STOP":
            if (member && !(await markHandled(msg.id, member.id, text))) continue;
            if (member) await db.update("customers", member.id, { whatsapp_opt_in: false });
            reply = "You've been unsubscribed from reminders and offers. Send JOIN to opt back in.";
            break;
        }
        // Replies are free-form text inside the 24h window the guest just opened.
        if (reply) await sendViaCloudApi(msg.from, reply, creds);
      }
    }
  }
  return json({ ok: true });
}
