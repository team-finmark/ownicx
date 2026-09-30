import "server-only";
import * as db from "./db";
import { couponCode, DAY, financialYear, formatDate, kycCheck, pointsForVisit, tierFor } from "./engine";
import { runAutomations } from "./runner";
import type { Channel, Customer } from "./types";

// Write-side operations shared by the dashboard (server actions) and the public REST API.

export async function onboardCustomer(input: {
  name: string;
  phone: string;
  email?: string | null;
  gender?: Customer["gender"];
  birthday?: string | null;
  channel: Channel;
  pan?: string | null;
  is_business?: boolean;
  whatsapp_opt_in: boolean;
  referral_code?: string | null;
}) {
  const kyc = kycCheck(input);
  if ((await db.count("customers", { eq: { phone: kyc.phone } })) > 0) throw new Error("A member with this phone number already exists");
  const tiers = await db.list("tiers");
  const referrer = input.referral_code ? (await db.query("customers", { eq: { referral_code: input.referral_code.trim().toUpperCase() }, limit: 1 }))[0] ?? null : null;
  if (input.referral_code && !referrer) throw new Error("Referral code not found");

  const first = input.name.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "OWN";
  const customer: Customer = {
    id: db.newId("c"),
    name: input.name.trim(),
    phone: kyc.phone,
    email: input.email || null,
    gender: input.gender ?? null,
    birthday: input.birthday || null,
    channel: input.channel,
    // Automated KYC: phone + PAN format pass → verified; anything flagged waits for staff review.
    kyc_status: kyc.ok ? "verified" : "pending",
    pan: input.pan ? input.pan.toUpperCase() : null,
    is_business: !!input.is_business,
    whatsapp_opt_in: input.whatsapp_opt_in,
    points: 0,
    lifetime_points: 0,
    tier_id: tierFor(0, tiers).id,
    referral_code: `${first}${Math.floor(1000 + Math.random() * 9000)}`,
    referred_by: referrer?.id ?? null,
    segment: input.gender === "female" ? ["women", "new"] : input.gender === "male" ? ["men", "new"] : ["new"],
    joined_at: new Date().toISOString(),
    last_visit_at: null,
    total_spend: 0,
    visit_count: 0,
  };
  await db.insert("customers", customer);

  if (referrer) {
    const rows: { referrer: Customer; level: 1 | 2 }[] = [{ referrer, level: 1 }];
    const grand = referrer.referred_by ? await db.get("customers", referrer.referred_by) : null;
    if (grand) rows.push({ referrer: grand, level: 2 });
    await db.insert(
      "referrals",
      rows.map((r) => ({
        id: db.newId("rf"),
        referrer_id: r.referrer.id,
        referee_id: customer.id,
        level: r.level,
        status: "pending" as const,
        points_awarded: 0,
        created_at: new Date().toISOString(),
      })),
    );
  }
  return { customer, kyc };
}

/**
 * Read-modify-write on a member without losing concurrent updates: the patch is applied only if
 * points/spend/visits are unchanged since the read, otherwise we re-read and try again.
 */
export async function changeMember(id: string, mutate: (c: Customer) => Partial<Customer>): Promise<{ before: Customer; after: Customer }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = await db.get("customers", id);
    if (!c) throw new Error("Member not found");
    const patch = mutate(c);
    const ok = await db.updateIf("customers", id, { points: c.points, lifetime_points: c.lifetime_points, visit_count: c.visit_count, total_spend: c.total_spend }, patch);
    if (ok) return { before: c, after: { ...c, ...patch } };
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new Error("This member is being updated from another till right now. Please try again.");
}

/** Adds (or removes) points. `countsTowardTier` = whether it also raises lifetime points (the tier ladder). */
export async function addPoints(customerId: string, delta: number, countsTowardTier = true) {
  const tiers = await db.list("tiers");
  return changeMember(customerId, (c) => {
    const lifetime = c.lifetime_points + (countsTowardTier ? Math.max(0, delta) : 0);
    return { points: Math.max(0, c.points + delta), lifetime_points: lifetime, tier_id: tierFor(lifetime, tiers).id };
  });
}

const MAX_BILL = 10_000_000; // ₹1 crore — anything above is almost certainly a typo or a bad integration

/** Validates bill amount and visit time from any source (dashboard, POS, API). */
function cleanVisitInput(amountIn: unknown, atIn: unknown, fallbackAmount: number) {
  let amount = fallbackAmount;
  if (amountIn !== undefined && amountIn !== null && amountIn !== "") {
    amount = typeof amountIn === "number" ? amountIn : typeof amountIn === "string" && /^\s*\d+(\.\d+)?\s*$/.test(amountIn) ? Number(amountIn) : NaN;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_BILL) throw new Error("Bill amount must be a number between 0 and 1,00,00,000");
    amount = Math.round(amount * 100) / 100;
  }
  const now = Date.now();
  let atMs = now;
  if (atIn !== undefined && atIn !== null && atIn !== "") {
    atMs = typeof atIn === "string" ? Date.parse(atIn) : NaN;
    if (Number.isNaN(atMs)) throw new Error('Visit time must be a date, e.g. "2026-10-01T10:30:00+05:30"');
    if (atMs > now + 5 * 60_000) throw new Error("Visit time can't be in the future");
    if (atMs < now - 5 * 365 * DAY) throw new Error("Visit time is more than 5 years ago");
  }
  return { amount, at: new Date(atMs).toISOString() };
}

/** Pays referral milestone rewards (e.g. 3 friends → +1,000 points) once each. The message row is the ledger. */
async function payReferralMilestones(referrerId: string) {
  const [settings, referrer] = await Promise.all([db.getSettings(), db.get("customers", referrerId)]);
  if (!referrer) return;
  const qualified = await db.count("referrals", { eq: { referrer_id: referrerId, level: 1 }, not: { status: "pending" } });
  const paid = new Set((await db.queryIn("messages", "dedupe_key", settings.referral_milestones.map((m) => `refms:${referrerId}:${m.count}`))).map((m) => m.dedupe_key));
  for (const m of settings.referral_milestones) {
    const key = `refms:${referrerId}:${m.count}`;
    if (qualified < m.count || paid.has(key)) continue;
    const now = Date.now();
    let code = "";
    if (m.points > 0) {
      await addPoints(referrerId, m.points);
    } else {
      // A non-points milestone ("Special gift") becomes a coupon the front desk honours.
      code = couponCode("GIFT");
      await db.insert("coupons", {
        id: db.newId("cp"),
        code,
        customer_id: referrerId,
        reward_id: null,
        label: m.label,
        value: 0,
        source: "referral",
        status: "active",
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * DAY).toISOString(),
        redeemed_at: null,
      });
    }
    const first = referrer.name.split(" ")[0];
    await db.insert("messages", {
      id: db.newId("m"),
      customer_id: referrerId,
      rule_id: null,
      campaign_id: null,
      dedupe_key: key,
      body: `🎉 ${first}, ${m.count} friend${m.count > 1 ? "s" : ""} joined ${settings.salon_name} through you! You've unlocked ${m.label}${code ? ` — show code ${code} at the counter` : ""}. Thank you!`,
      status: referrer.whatsapp_opt_in ? "queued" : "skipped",
      created_at: new Date(now).toISOString(),
      sent_at: null,
      error: referrer.whatsapp_opt_in ? null : "Member hasn't agreed to WhatsApp messages",
    });
  }
}

export async function recordVisit(input: { customer_id: string; service_id: string; amount?: unknown; at?: unknown }) {
  const [service, tiers, settings] = await Promise.all([db.get("services", input.service_id), db.list("tiers"), db.getSettings()]);
  if (!service) throw new Error("Service not found");
  const { amount, at } = cleanVisitInput(input.amount, input.at, service.price);

  let earned = 0;
  let tierBeforeId = "";
  const { before, after } = await changeMember(input.customer_id, (c) => {
    const tierBefore = tierFor(c.lifetime_points, tiers);
    tierBeforeId = tierBefore.id;
    earned = pointsForVisit(service, tierBefore);
    const lifetime = c.lifetime_points + earned;
    const visits = c.visit_count + 1;
    return {
      points: c.points + earned,
      lifetime_points: lifetime,
      tier_id: tierFor(lifetime, tiers).id,
      // Back-dated imports must not move "last visit" backwards.
      last_visit_at: !c.last_visit_at || Date.parse(at) > Date.parse(c.last_visit_at) ? at : c.last_visit_at,
      total_spend: Math.round((c.total_spend + amount) * 100) / 100,
      visit_count: visits,
      segment: c.segment.filter((t) => t !== "lapsed" && !(t === "new" && visits >= 2)),
    };
  });
  await db.insert("visits", { id: db.newId("v"), customer_id: before.id, service_id: service.id, amount, points_earned: earned, at });

  // First paid visit qualifies any pending referral → reward the referrer chain (once: status flips first).
  if (before.visit_count === 0) {
    const pending = await db.query("referrals", { eq: { referee_id: before.id, status: "pending" } });
    for (const r of pending) {
      const pts = r.level === 1 ? settings.referral_level1_points : settings.referral_level2_points;
      const won = await db.updateIf("referrals", r.id, { status: "pending" }, { status: "rewarded", points_awarded: pts });
      if (!won) continue;
      await addPoints(r.referrer_id, pts);
      if (r.level === 1) await payReferralMilestones(r.referrer_id);
    }
  }

  // Crossing a milestone should feel instant, not "tomorrow at 10": fire milestone rules for this guest now.
  const auto = await runAutomations({ filter: (p) => p.customer.id === before.id && p.rule.type === "milestone_offer", dispatchBudgetMs: 2500 });
  const tierAfter = tiers.find((t) => t.id === after.tier_id)!;
  return { points_earned: earned, balance: after.points, tier: tierAfter.name, tier_upgraded: after.tier_id !== tierBeforeId, offers_issued: auto.couponsIssued };
}

export async function issueRewardCoupon(customerId: string, rewardId: string, validityDays?: number) {
  const [c, reward, tiers] = await Promise.all([db.get("customers", customerId), db.get("rewards", rewardId), db.list("tiers")]);
  if (!c || !reward) throw new Error("Not found");
  if (c.points < reward.cost_points) throw new Error(`Needs ${reward.cost_points} points, has ${c.points}`);
  if (reward.tier_id) {
    const need = tiers.find((t) => t.id === reward.tier_id)!;
    if (c.lifetime_points < need.min_points) throw new Error(`${reward.name} unlocks at ${need.name}`);
  }
  await changeMember(c.id, (fresh) => {
    if (fresh.points < reward.cost_points) throw new Error(`Needs ${reward.cost_points} points, has ${fresh.points}`);
    return { points: fresh.points - reward.cost_points };
  });
  const now = Date.now();
  const coupon = {
    id: db.newId("cp"),
    code: couponCode(),
    customer_id: c.id,
    reward_id: reward.id,
    label: reward.name,
    value: reward.kind === "percent_off" ? 0 : reward.value,
    source: "redemption" as const,
    status: "active" as const,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + (validityDays && validityDays > 0 ? validityDays : reward.validity_days) * DAY).toISOString(),
    redeemed_at: null,
  };
  await db.insert("coupons", coupon);
  return coupon;
}

/**
 * Redeems a code at the counter. %-off coupons need the bill amount so the benefit's real ₹ value
 * is recorded (194R counts it). Two tills scanning the same code: only one wins.
 */
export async function redeemCouponByCode(raw: string, bill?: unknown) {
  const code = raw.trim().toUpperCase();
  const [cp] = await db.query("coupons", { eq: { code }, limit: 1 });
  if (!cp) throw new Error(`No coupon ${code}`);
  if (cp.status !== "active") throw new Error(`${code} is already ${cp.status}`);
  if (new Date(cp.expires_at).getTime() < Date.now()) {
    await db.update("coupons", cp.id, { status: "expired" });
    throw new Error(`${code} expired on ${formatDate(cp.expires_at)}`);
  }
  let value = cp.value;
  const reward = cp.reward_id ? await db.get("rewards", cp.reward_id) : null;
  if (reward?.kind === "percent_off") {
    const amount = typeof bill === "number" ? bill : typeof bill === "string" && /^\s*\d+(\.\d+)?\s*$/.test(bill) ? Number(bill) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${code} is ${reward.value}% off — enter the bill amount to redeem it`);
    value = Math.round((amount * reward.value) / 100);
  }
  const redeemed_at = new Date().toISOString();
  const won = await db.updateIf("coupons", cp.id, { status: "active" }, { status: "redeemed", redeemed_at, value });
  if (!won) throw new Error(`${code} was just redeemed at another till`);
  return { ...cp, value, status: "redeemed" as const, redeemed_at };
}

// ---------- Member maintenance ----------

export interface MemberEdit {
  name: string;
  phone: string;
  email: string | null;
  gender: Customer["gender"];
  birthday: string | null;
  pan: string | null;
  is_business: boolean;
  whatsapp_opt_in: boolean;
  kyc_status: Customer["kyc_status"];
}

export async function updateMember(id: string, input: MemberEdit) {
  const c = await db.get("customers", id);
  if (!c) throw new Error("Member not found");
  if (!input.name.trim()) throw new Error("Name is required");
  const kyc = kycCheck({ phone: input.phone, pan: input.pan, is_business: input.is_business });
  if (!/^\d{10,15}$/.test(kyc.phone)) throw new Error("Enter a valid mobile number");
  if ((await db.query("customers", { eq: { phone: kyc.phone }, limit: 2 })).some((o) => o.id !== id)) throw new Error(`Another member already uses +${kyc.phone}`);
  const pan = input.pan ? input.pan.toUpperCase() : null;
  const identityChanged = kyc.phone !== c.phone || pan !== c.pan || input.is_business !== c.is_business;
  await db.update("customers", id, {
    name: input.name.trim(),
    phone: kyc.phone,
    email: input.email || null,
    gender: input.gender || null,
    birthday: input.birthday || null,
    pan,
    is_business: input.is_business,
    whatsapp_opt_in: input.whatsapp_opt_in,
    // A manager's explicit KYC choice wins; otherwise re-run the automatic checks when identity details change.
    kyc_status: input.kyc_status !== c.kyc_status ? input.kyc_status : identityChanged ? (kyc.ok ? "verified" : "pending") : c.kyc_status,
  });
  return { issues: identityChanged ? kyc.issues : [] };
}

/**
 * Permanently deletes a member with their visits, coupons, messages and referral links.
 * Business members who received benefits this financial year are kept: that history is the 194R record.
 */
export async function removeMember(id: string) {
  const [c, referred, coupons, settings] = await Promise.all([db.get("customers", id), db.query("customers", { eq: { referred_by: id } }), db.query("coupons", { eq: { customer_id: id } }), db.getSettings()]);
  if (!c) throw new Error("Member not found");
  if (c.is_business) {
    const fy = financialYear(Date.now());
    const benefits = coupons
      .filter((cp) => cp.customer_id === id && cp.status === "redeemed" && cp.redeemed_at && new Date(cp.redeemed_at).getTime() >= fy.start)
      .reduce((a, cp) => a + cp.value, 0);
    if (benefits > 0) {
      throw new Error(
        `${c.name} received ₹${benefits.toLocaleString("en-IN")} in benefits this ${fy.label}, which must stay on record for 194R (threshold ₹${settings.tds_threshold.toLocaleString("en-IN")}). Turn off their WhatsApp messages instead, or remove them after the year closes.`,
      );
    }
  }
  // People they referred stay members; only the link is cleared.
  for (const r of referred) await db.update("customers", r.id, { referred_by: null });
  if (db.isDemo()) {
    // Supabase cascades these deletes; the in-memory demo database needs it done by hand.
    const [visits, messages, asReferrer, asReferee] = await Promise.all([
      db.query("visits", { eq: { customer_id: id } }),
      db.query("messages", { eq: { customer_id: id } }),
      db.query("referrals", { eq: { referrer_id: id } }),
      db.query("referrals", { eq: { referee_id: id } }),
    ]);
    for (const v of visits) await db.remove("visits", v.id);
    for (const cp of coupons) await db.remove("coupons", cp.id);
    for (const m of messages) await db.remove("messages", m.id);
    for (const r of [...asReferrer, ...asReferee]) await db.remove("referrals", r.id);
  }
  await db.remove("customers", id);
  return c.name;
}

/** Moves a member's coupon expiry. Unused coupons given a future date become active again. */
export async function setCouponExpiry(couponId: string, expiresOn: string) {
  const cp = await db.get("coupons", couponId);
  if (!cp) throw new Error("Coupon not found");
  if (cp.status === "redeemed") throw new Error(`${cp.code} was already redeemed`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new Error("Pick a date");
  // End of that day in India time.
  const expires = new Date(`${expiresOn}T23:59:59+05:30`);
  if (Number.isNaN(expires.getTime())) throw new Error("Pick a valid date");
  const status = expires.getTime() > Date.now() ? "active" : "expired";
  await db.update("coupons", couponId, { expires_at: expires.toISOString(), status });
  return { code: cp.code, status };
}
