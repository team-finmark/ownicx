import "server-only";
import * as db from "./db";
import { dispatchQueued } from "./dispatch";
import { DAY, planAutomations, tierFor, type PlannedSend, type Snapshot } from "./engine";
import { changeMember } from "./loyalty";
import { cloudCreds, fillTemplate, getConnection } from "./whatsapp";

class SkipPlan extends Error {}

// Rules only look back this far: revisit cycles are ≤ 120 days (+2 follow-ups) and win-back
// reads last_visit_at from the member, so older visits never change a decision.
const LOOKBACK_DAYS = 400;

/**
 * What the rules need — bounded, not whole tables: members, recent visits, live coupons.
 * `messages` is left empty; duplicates are checked afterwards against exactly the planned keys.
 */
export async function loadSnapshot(now = Date.now()): Promise<Snapshot> {
  const [customers, services, visits, tiers, coupons, rules, settings] = await Promise.all([
    db.list("customers"),
    db.list("services"),
    db.query("visits", { gte: { at: new Date(now - LOOKBACK_DAYS * DAY).toISOString() } }),
    db.list("tiers"),
    db.query("coupons", { eq: { status: "active" } }),
    db.list("automation_rules"),
    db.getSettings(),
  ]);
  return { customers, services, visits, tiers, coupons, messages: [], rules, settings };
}

/** Plans, minus anything already sent (looked up by the plans' own dedupe keys). */
async function plan(snap: Snapshot, now: number, respectSendHour: boolean) {
  const planned = planAutomations(snap, { now, respectSendHour });
  if (!planned.length) return planned;
  const done = new Set((await db.queryIn("messages", "dedupe_key", planned.map((p) => p.dedupe_key))).map((m) => m.dedupe_key));
  return planned.filter((p) => !done.has(p.dedupe_key));
}

export async function previewAutomations(now = Date.now(), snap?: Snapshot): Promise<PlannedSend[]> {
  return plan(snap ?? (await loadSnapshot(now)), now, false);
}

export interface RunResult {
  planned: number;
  queued: number;
  sent: number;
  failed: number;
  couponsIssued: number;
  expired: number;
  mode: string;
  remaining?: number;
}

/**
 * Evaluates every enabled rule, applies side-effects (coupons, point changes), and writes one
 * message per trigger. Dedupe keys make it safe to call as often as you like. In automatic
 * WhatsApp mode the messages are then sent by the queue dispatcher within a time budget.
 */
export async function runAutomations({
  now = Date.now(),
  respectSendHour = false,
  filter,
  dispatch = true,
  dispatchBudgetMs = 7000,
}: { now?: number; respectSendHour?: boolean; filter?: (p: PlannedSend) => boolean; dispatch?: boolean; dispatchBudgetMs?: number } = {}): Promise<RunResult> {
  const snap = await loadSnapshot(now);
  const cloud = !!cloudCreds(await getConnection());

  // Housekeeping: close out offers whose window has passed.
  const lapsed = snap.coupons.filter((cp) => new Date(cp.expires_at).getTime() < now);
  for (let i = 0; i < lapsed.length; i += 20) {
    await Promise.all(lapsed.slice(i, i + 20).map((cp) => db.update("coupons", cp.id, { status: "expired" })));
  }
  for (const cp of lapsed) cp.status = "expired";

  const plans = (await plan(snap, now, respectSendHour)).filter(filter ?? (() => true));
  const result: RunResult = { planned: plans.length, queued: 0, sent: 0, failed: 0, couponsIssued: 0, expired: lapsed.length, mode: cloud ? "cloud_api" : "click_to_chat" };

  for (const p of plans) {
    // Points move first, on a fresh read of the member (several plans can touch the same member in one run).
    if (p.pointsDelta) {
      const delta = p.pointsDelta;
      try {
        await changeMember(p.customer.id, (c) => {
          if (delta < 0 && c.points < -delta) throw new SkipPlan();
          // Automation points (win-back bonus, milestone deduction) never move lifetime points, so they can't change tier.
          return { points: Math.max(0, c.points + delta), tier_id: tierFor(c.lifetime_points, snap.tiers).id };
        });
      } catch (e) {
        if (e instanceof SkipPlan) {
          result.planned--;
          continue; // balance changed since the snapshot (e.g. they redeemed); nothing is issued or sent
        }
        throw e;
      }
    }
    if (p.newCoupon) {
      await db.insert("coupons", p.newCoupon);
      result.couponsIssued++;
    }
    await db.insert("messages", {
      id: db.newId("m"),
      customer_id: p.customer.id,
      rule_id: p.rule.id,
      campaign_id: null,
      dedupe_key: p.dedupe_key,
      body: p.body,
      status: "queued",
      created_at: new Date(now).toISOString(),
      sent_at: null,
      error: null,
      template: fillTemplate(p.rule.wa_template, p.vars),
      attempts: 0,
    });
    result.queued++;
  }

  if (cloud && dispatch) {
    const d = await dispatchQueued({ budgetMs: dispatchBudgetMs });
    result.sent = d.sent;
    result.failed = d.failed;
    result.queued = d.remaining;
    result.remaining = d.remaining;
  }
  return result;
}
