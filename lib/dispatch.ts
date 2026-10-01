import "server-only";
import * as db from "./db";
import { cloudCreds, getConnection, sendViaCloudApi } from "./whatsapp";
import type { Message } from "./types";

// Background sending queue for automatic WhatsApp mode. Messages are written as "queued" first;
// this drains them in small parallel batches within a time budget, so no single request (campaign
// launch, cron run) can hit the host's time limit. Supabase pg_cron calls /api/messages/dispatch
// every few minutes to finish anything left.

const MAX_ATTEMPTS = 3;
const FRESH_MS = 24 * 3600_000; // never auto-send stale tap-to-send items after switching modes
const CONCURRENCY = 5;

export interface DispatchResult {
  mode: "cloud_api" | "click_to_chat";
  sent: number;
  failed: number;
  retrying: number;
  remaining: number;
}

export async function dispatchQueued({ budgetMs = 8000, max = 300 } = {}): Promise<DispatchResult> {
  const started = Date.now();
  const creds = cloudCreds(await getConnection());
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  if (!creds) return { mode: "click_to_chat", sent: 0, failed: 0, retrying: 0, remaining: await db.count("messages", { eq: { status: "queued" } }) };

  const batch = await db.query("messages", { eq: { status: "queued" }, gte: { created_at: since }, order: { column: "created_at" }, limit: max });
  const members = await db.queryIn("customers", "id", batch.map((m) => m.customer_id));
  const phones = new Map(members.map((c) => [c.id, c.phone]));
  const mock = new Set(members.filter((c) => c.segment.includes("mock")).map((c) => c.id));
  const res: DispatchResult = { mode: "cloud_api", sent: 0, failed: 0, retrying: 0, remaining: 0 };

  let i = 0;
  const worker = async () => {
    while (i < batch.length && Date.now() - started < budgetMs) {
      const m: Message = batch[i++];
      const tries = m.attempts ?? 0;
      if (tries >= MAX_ATTEMPTS) continue;
      // Claim it: only one dispatcher may send a given message.
      if (!(await db.updateIf("messages", m.id, { status: "queued", attempts: m.attempts }, { attempts: tries + 1 }))) continue;
      if (mock.has(m.customer_id)) {
        // Demo data (scripts/mock-data.mjs): made-up numbers are never messaged.
        await db.update("messages", m.id, { status: "skipped", error: "Demo member — never sent" });
        continue;
      }
      const phone = phones.get(m.customer_id);
      const r = phone ? await sendViaCloudApi(phone, m.body, creds, m.template) : { ok: false as const, error: "Member no longer exists" };
      if (r.ok) {
        await db.update("messages", m.id, { status: "sent", sent_at: new Date().toISOString(), error: null });
        res.sent++;
      } else if (tries + 1 >= MAX_ATTEMPTS || !phone || /template|window/i.test(r.error)) {
        // Permanent problems (no template, outside window, member gone) don't improve with retries.
        await db.update("messages", m.id, { status: "failed", error: r.error });
        res.failed++;
      } else {
        await db.update("messages", m.id, { error: `Attempt ${tries + 1} failed: ${r.error} — retrying` });
        res.retrying++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  res.remaining = await db.count("messages", { eq: { status: "queued" }, gte: { created_at: since } });
  return res;
}
