"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { audienceFor } from "@/lib/analytics";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { couponCode, DAY, formatDate, renderTemplate, tierFor } from "@/lib/engine";
import { issueRewardCoupon, onboardCustomer, recordVisit, redeemCouponByCode, removeMember, setCouponExpiry, updateMember } from "@/lib/loyalty";
import { runAutomations } from "@/lib/runner";
import { dispatchQueued } from "@/lib/dispatch";
import { cloudCreds, fillTemplate, getConnection } from "@/lib/whatsapp";
import type { AutomationRule, Campaign, Channel, Customer, Reward, RuleType, WaTemplate } from "@/lib/types";

export type ActionState = { ok: boolean; message: string } | null;

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string, d = 0) => {
  const v = Number(f.get(k));
  return Number.isFinite(v) ? v : d;
};
const refresh = () => revalidatePath("/", "layout");

async function attempt(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

// ---------- Automations ----------

export async function runAutomationsNow(_: ActionState): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const r = await runAutomations();
    if (!r.planned) return "All caught up — nobody is due a message right now.";
    return `${r.planned} message(s) created · ${r.couponsIssued} offer(s) issued${r.mode === "cloud_api" ? ` · ${r.sent} sent, ${r.failed} failed` : " · open the Outbox to send"}`;
  });
}

export async function saveRule(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const id = s(f, "id");
    const rule = await db.get("automation_rules", id);
    if (!rule) throw new Error("Rule not found");
    const type = rule.type as RuleType;
    const config: AutomationRule["config"] =
      type === "revisit_reminder"
        ? { service_id: s(f, "service_id") || "any", days_after: n(f, "days_after", 60), cooldown_days: n(f, "cooldown_days", 30) }
        : type === "milestone_offer"
          ? { points_threshold: n(f, "points_threshold", 150), discount_value: n(f, "discount_value", 150), validity_days: n(f, "validity_days", 14), deduct_points: f.get("deduct_points") === "on" }
          : type === "expiry_nudge"
            ? { days_before: s(f, "days_before").split(/[,\s]+/).map(Number).filter((x) => x > 0) }
            : type === "winback"
              ? { inactive_days: n(f, "inactive_days", 120), bonus_points: n(f, "bonus_points", 20) }
              : { discount_value: n(f, "discount_value", 200), validity_days: n(f, "validity_days", 7) };
    const template = s(f, "template");
    if (!template) throw new Error("Message can't be empty");
    await db.update("automation_rules", id, {
      name: s(f, "name") || rule.name,
      enabled: f.get("enabled") === "on",
      send_hour: Math.min(23, Math.max(0, n(f, "send_hour", 10))),
      audience: s(f, "audience") || "all",
      template,
      config,
      wa_template: readTemplate(f),
    });
    return `Saved “${s(f, "name") || rule.name}”`;
  });
}

export async function toggleRule(id: string, enabled: boolean) {
  await requireManager();
  await db.update("automation_rules", id, { enabled });
  refresh();
}

export async function createRule(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const type = s(f, "type") as RuleType;
    const defaults: Record<RuleType, Pick<AutomationRule, "name" | "config" | "template">> = {
      revisit_reminder: { name: "New revisit reminder", config: { service_id: "any", days_after: 30, cooldown_days: 21 }, template: "Hi {{first_name}}, it's been {{days}} days since your last {{service}} at {{salon}}. Book: {{booking_link}}" },
      milestone_offer: { name: "New milestone offer", config: { points_threshold: 300, discount_value: 300, validity_days: 14, deduct_points: true }, template: "🎉 {{first_name}}, you've unlocked ₹{{offer}} off — code {{code}}, valid till {{expiry}}." },
      expiry_nudge: { name: "New expiry nudge", config: { days_before: [5, 2] }, template: "⏳ {{first_name}}, {{offer_label}} expires in {{days_left}} day(s). Code {{code}}." },
      winback: { name: "New win-back", config: { inactive_days: 90, bonus_points: 15 }, template: "We miss you {{first_name}}! {{bonus}} bonus points are waiting at {{salon}}." },
      birthday: { name: "New birthday treat", config: { discount_value: 200, validity_days: 7 }, template: "Happy birthday {{first_name}} 🎂 ₹{{offer}} off, code {{code}}, till {{expiry}}." },
    };
    if (!defaults[type]) throw new Error("Pick a rule type");
    await db.insert("automation_rules", { id: db.newId("rule"), type, enabled: false, send_hour: 10, audience: "all", ...defaults[type] });
    return "Rule created (paused) — tune it and switch it on.";
  });
}

export async function deleteRule(id: string) {
  await requireManager();
  await db.remove("automation_rules", id);
  refresh();
}

export async function markMessage(id: string, status: "sent" | "skipped") {
  await requireManager();
  await db.update("messages", id, { status, sent_at: status === "sent" ? new Date().toISOString() : null });
  refresh();
}

// ---------- Members ----------

export async function onboardAction(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const name = s(f, "name");
    if (!name) throw new Error("Name is required");
    const customer = await onboardCustomer({
      name,
      phone: s(f, "phone"),
      email: s(f, "email") || null,
      gender: (s(f, "gender") || null) as Customer["gender"],
      birthday: s(f, "birthday") || null,
      channel: (s(f, "channel") || "walk_in") as Channel,
      pan: s(f, "pan") || null,
      is_business: f.get("is_business") === "on",
      whatsapp_opt_in: f.get("whatsapp_opt_in") === "on",
      referral_code: s(f, "referral_code") || null,
    });
    return `${customer.name} is in. Referral code ${customer.referral_code}.`;
  });
}

export async function updateMemberAction(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    await updateMember(s(f, "id"), {
      name: s(f, "name"),
      phone: s(f, "phone"),
      email: s(f, "email") || null,
      gender: (s(f, "gender") || null) as Customer["gender"],
      birthday: s(f, "birthday") || null,
      pan: s(f, "pan") || null,
      is_business: f.get("is_business") === "on",
      whatsapp_opt_in: f.get("whatsapp_opt_in") === "on",
    });
    return `Saved ${s(f, "name")}`;
  });
}

export async function removeMemberAction(id: string): Promise<ActionState> {
  await requireManager();
  return attempt(async () => `Removed ${await removeMember(id)}`);
}

export async function setCouponExpiryAction(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const r = await setCouponExpiry(s(f, "coupon_id"), s(f, "expires_on"));
    return `${r.code} now expires ${formatDate(`${s(f, "expires_on")}T12:00:00+05:30`)}${r.status === "expired" ? " (already past, so it's marked expired)" : ""}`;
  });
}

export async function recordVisitAction(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const r = await recordVisit({ customer_id: s(f, "customer_id"), service_id: s(f, "service_id"), amount: n(f, "amount") || undefined });
    return `+${r.points_earned} pts · balance ${r.balance}${r.tier_upgraded ? ` · upgraded to ${r.tier} 🎉` : ""}${r.offers_issued ? " · milestone offer sent to Outbox" : ""}`;
  });
}

export async function redeemRewardAction(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const days = n(f, "validity_days", 0);
    const c = await issueRewardCoupon(s(f, "customer_id"), s(f, "reward_id"), days > 0 ? Math.min(365, days) : undefined);
    return `Issued ${c.label} — code ${c.code}, expires ${formatDate(c.expires_at)}`;
  });
}

// ---------- Rewards & coupons ----------

export async function createReward(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const name = s(f, "name");
    if (!name) throw new Error("Name is required");
    const reward: Reward = {
      id: db.newId("rw"),
      name,
      kind: (s(f, "kind") || "flat_off") as Reward["kind"],
      value: n(f, "value"),
      cost_points: n(f, "cost_points", 100),
      tier_id: s(f, "tier_id") || null,
      validity_days: n(f, "validity_days", 30),
      active: true,
      emoji: s(f, "emoji") || "🎁",
    };
    await db.insert("rewards", reward);
    return `Added ${reward.name} to the catalogue`;
  });
}

export async function toggleReward(id: string, active: boolean) {
  await requireManager();
  await db.update("rewards", id, { active });
  refresh();
}

export async function generateCoupons(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const qty = Math.min(500, Math.max(1, n(f, "qty", 10)));
    const value = n(f, "value");
    const days = n(f, "validity_days", 30);
    const prefix = (s(f, "prefix") || "OWN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const label = s(f, "label") || `₹${value} off`;
    const now = Date.now();
    const rows = Array.from({ length: qty }, () => ({
      id: db.newId("cp"),
      code: couponCode(prefix),
      customer_id: null,
      reward_id: null,
      label,
      value,
      source: "manual" as const,
      status: "active" as const,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + days * DAY).toISOString(),
      redeemed_at: null,
    }));
    await db.insert("coupons", rows);
    return `Generated ${qty} codes (${prefix}…) valid for ${days} days`;
  });
}

export async function redeemCoupon(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const cp = await redeemCouponByCode(s(f, "code"), s(f, "bill") || undefined);
    return `Redeemed ${cp.code} — ${cp.label}${cp.value ? ` (₹${cp.value.toLocaleString("en-IN")} benefit)` : ""}`;
  });
}

// ---------- Tiers ----------

export async function saveTier(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const id = s(f, "id");
    await db.update("tiers", id, {
      name: s(f, "name"),
      min_points: n(f, "min_points"),
      multiplier: n(f, "multiplier", 1),
      perks: s(f, "perks").split("\n").map((p) => p.trim()).filter(Boolean),
    });
    // Re-rank every member against the new ladder.
    const [tiers, customers] = await Promise.all([db.list("tiers"), db.list("customers")]);
    let moved = 0;
    for (const c of customers) {
      const t = tierFor(c.lifetime_points, tiers).id;
      if (t !== c.tier_id) {
        await db.update("customers", c.id, { tier_id: t });
        moved++;
      }
    }
    return `Saved ${s(f, "name")} · ${moved} member(s) re-ranked`;
  });
}

// ---------- Campaigns ----------

export async function createCampaign(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const days = Math.min(90, Math.max(1, n(f, "days", 7)));
    const now = Date.now();
    const segment = s(f, "segment") || "all";
    let memberIds: string[] = [];
    if (segment === "members") {
      const picked = new Set(f.getAll("member_ids").map(String));
      memberIds = (await db.list("customers")).filter((c) => picked.has(c.id)).map((c) => c.id);
      if (!memberIds.length) throw new Error("Pick at least one member");
    }
    const cost = n(f, "cost", 0);
    if (cost < 0) throw new Error("Reward cost can't be negative");
    const holdout = Math.round(n(f, "holdout_pct", 0));
    if (![0, 10, 20].includes(holdout)) throw new Error("Control group must be 0%, 10% or 20%");
    const c: Campaign = {
      id: db.newId("cmp"),
      name: s(f, "name") || "Untitled campaign",
      segment,
      member_ids: memberIds,
      channel: "whatsapp", // the only delivery channel today
      offer: s(f, "offer"),
      status: "draft",
      starts_at: new Date(now).toISOString(),
      ends_at: new Date(now + days * DAY).toISOString(),
      sent: 0,
      converted: 0,
      revenue: 0,
      cost,
      holdout_pct: holdout,
      holdout_ids: [],
      wa_template: readTemplate(f),
    };
    if (!c.offer) throw new Error("Describe the offer");
    await db.insert("campaigns", c);
    return `Draft “${c.name}” created`;
  });
}

/** Optional Meta template fields shared by rule and campaign forms. */
function readTemplate(f: FormData): WaTemplate | null {
  const name = s(f, "wa_template_name");
  if (!name) return null;
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error("Template name: lowercase letters, numbers and _ only, exactly as in Meta");
  const params = s(f, "wa_template_params").split(/[,\s]+/).map((p) => p.replace(/[{}]/g, "")).filter(Boolean);
  return { name, language: s(f, "wa_template_language") || "en", params };
}

/**
 * Launch: optionally holds back a random control group (no message), then queues one message per
 * remaining opted-in member. In automatic mode the queue dispatcher starts sending right away and
 * the scheduler finishes the rest, so big audiences never hit the host's time limit.
 */
async function launch(id: string): Promise<string> {
  const [cmp, customers, settings, conn] = await Promise.all([db.get("campaigns", id), db.list("customers"), db.getSettings(), getConnection()]);
  if (!cmp) throw new Error("Campaign not found");
  if (cmp.channel !== "whatsapp") throw new Error("App push isn't available yet — create a WhatsApp campaign instead");
  if (cmp.status === "live" || cmp.status === "ended") throw new Error(`“${cmp.name}” is already ${cmp.status}`);
  if (Date.parse(cmp.ends_at) < Date.now()) throw new Error(`“${cmp.name}” ended on ${formatDate(cmp.ends_at)} — create a new campaign`);

  const everyone = audienceFor(customers, cmp.segment, cmp.member_ids ?? []);
  // Random control group: these members get nothing, so their visits show what would have happened anyway.
  const ids = everyone.map((c) => c.id);
  for (let k = ids.length - 1; k > 0; k--) {
    const r = randomInt(k + 1);
    [ids[k], ids[r]] = [ids[r], ids[k]];
  }
  const holdN = (cmp.holdout_pct ?? 0) > 0 && ids.length >= 10 ? Math.round((ids.length * (cmp.holdout_pct ?? 0)) / 100) : 0;
  const holdout = new Set(ids.slice(0, holdN));
  const already = new Set((await db.queryIn("messages", "dedupe_key", everyone.map((c) => `campaign:${cmp.id}:${c.id}`))).map((m) => m.dedupe_key));
  const audience = everyone.filter((c) => !holdout.has(c.id) && !already.has(`campaign:${cmp.id}:${c.id}`));

  const now = new Date().toISOString();
  const rows = audience.map((c) => {
    const vars = { first_name: c.name.split(" ")[0], offer: cmp.offer, salon: settings.salon_name, booking_link: settings.booking_link };
    return {
      id: db.newId("m"),
      customer_id: c.id,
      rule_id: null,
      campaign_id: cmp.id,
      dedupe_key: `campaign:${cmp.id}:${c.id}`,
      body: renderTemplate("Hi {{first_name}} ✨ {{offer}} at {{salon}} — just for you. Book: {{booking_link}}", vars),
      status: "queued" as const,
      created_at: now,
      sent_at: null,
      error: null,
      template: fillTemplate(cmp.wa_template, vars),
      attempts: 0,
    };
  });
  for (let k = 0; k < rows.length; k += 500) await db.insert("messages", rows.slice(k, k + 500));
  await db.update("campaigns", id, { status: "live", sent: cmp.sent + rows.length, starts_at: now, holdout_ids: [...holdout] });

  const held = holdN ? ` · ${holdN} held back as a control group` : "";
  if (!rows.length) return `“${cmp.name}” is live, but nobody in this audience has agreed to WhatsApp messages${held}`;
  if (!cloudCreds(conn)) return `“${cmp.name}” queued ${rows.length} message${rows.length === 1 ? "" : "s"} — send them from the Outbox${held}`;
  const d = await dispatchQueued({ budgetMs: 7000 });
  return `“${cmp.name}”: ${d.sent} sent now${d.failed ? `, ${d.failed} failed (see Outbox)` : ""}${d.remaining ? `, ${d.remaining} more sending in the background` : ""}${held}`;
}

export async function launchCampaign(id: string): Promise<ActionState> {
  await requireManager();
  return attempt(() => launch(id));
}

// ---------- Settings ----------

export async function saveSettings(_: ActionState, f: FormData): Promise<ActionState> {
  await requireManager();
  return attempt(async () => {
    const patch: Record<string, unknown> = {};
    for (const k of ["salon_name", "booking_link", "whatsapp_number", "timezone"]) if (f.has(k)) patch[k] = s(f, k);
    for (const k of ["margin_goal_pct", "reward_budget_pct", "referral_level1_points", "referral_level2_points"])
      if (f.has(k)) patch[k] = n(f, k);
    if (f.has("milestone_count")) {
      const counts = f.getAll("milestone_count").map(Number);
      const labels = f.getAll("milestone_label").map(String);
      const pts = f.getAll("milestone_points").map(Number);
      patch.referral_milestones = counts.map((count, i) => ({ count, label: labels[i], points: pts[i] || 0 })).filter((m) => m.count > 0);
    }
    await db.update("settings", "default", patch);
    return "Settings saved";
  });
}
