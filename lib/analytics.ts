import type { Campaign, Coupon, Customer, Message, Service, Visit } from "./types";
import { DAY, daysSince, istDay, istMonthKey } from "./engine";

/** The last n calendar months in India time, oldest first. */
export function lastMonths(n: number, now = Date.now()) {
  const out: { key: string; label: string }[] = [];
  const [y, m] = istDay(now).split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    out.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }) });
  }
  return out;
}
const monthKey = (iso: string) => istMonthKey(iso);

export function monthly<T>(rows: T[], at: (r: T) => string | null, val: (r: T) => number, months: { key: string }[]) {
  const map = new Map(months.map((m) => [m.key, 0]));
  for (const r of rows) {
    const a = at(r);
    if (!a) continue;
    const k = monthKey(a);
    if (map.has(k)) map.set(k, map.get(k)! + val(r));
  }
  return months.map((m) => map.get(m.key)!);
}

/** Guests past their usual cycle by 30+ days but not yet lapsed — the churn-intervention list. */
export function churnSignals(customers: Customer[], visits: Visit[], services: Service[], now = Date.now()) {
  const svc = new Map(services.map((s) => [s.id, s]));
  const byC = new Map<string, Visit[]>();
  for (const v of visits) (byC.get(v.customer_id) ?? byC.set(v.customer_id, []).get(v.customer_id)!).push(v);
  return customers
    .map((c) => {
      const vs = (byC.get(c.id) ?? []).sort((a, b) => b.at.localeCompare(a.at));
      if (!vs.length) return null;
      // Their usual cycle = cycle of the service they book most often.
      const freq = new Map<string, number>();
      vs.forEach((v) => freq.set(v.service_id, (freq.get(v.service_id) ?? 0) + 1));
      const main = [...freq].sort((a, b) => b[1] - a[1])[0][0];
      const cycle = svc.get(main)?.revisit_days ?? 60;
      const since = daysSince(vs[0].at, now);
      const overdue = since - cycle;
      const risk = overdue / Math.max(cycle, 1); // cycles missed beyond the usual one
      return { customer: c, since, cycle, overdue, risk };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.overdue >= 30 && x.since < 240)
    .sort((a, b) => b.customer.total_spend - a.customer.total_spend);
}

export function activeWithin(customers: Customer[], days: number, now = Date.now()) {
  return customers.filter((c) => c.last_visit_at && now - new Date(c.last_visit_at).getTime() <= days * DAY).length;
}

export function rewardCost(coupons: Coupon[], sinceMs: number) {
  return coupons.filter((c) => c.status === "redeemed" && c.redeemed_at && new Date(c.redeemed_at).getTime() >= sinceMs).reduce((a, c) => a + c.value, 0);
}

// ---------- Campaign audiences & results ----------

/** Who a campaign or experiment targets (opted-in members only). */
export function audienceFor(customers: Customer[], segment: string, memberIds: string[] = []) {
  return customers.filter(
    (c) =>
      c.whatsapp_opt_in &&
      (segment === "all" ||
        (segment === "members" && memberIds.includes(c.id)) ||
        c.segment.includes(segment) ||
        (segment.startsWith("tier:") && c.tier_id === segment.slice(5))),
  );
}

export interface CampaignResult {
  sent: number;
  converted: number;
  revenue: number;
  cost: number;
  status: Campaign["status"];
  tracked: boolean; // false = figures entered by hand (e.g. demo history)
  /** No-message control group, when the campaign held one back. */
  control?: { size: number; converted: number; revenue: number };
  /** Booking-rate difference, messaged minus control, in percentage points. */
  liftPts?: number;
  /** Revenue the message itself brought in (messaged revenue minus what the control rate predicts). */
  incrementalRevenue?: number;
}

/**
 * Attribution: a member "booked" if they visited after their campaign message and before the
 * campaign ended. Revenue = what those members spent in that window.
 */
export function campaignStats(c: Campaign, messages: Message[], visits: Visit[], now = Date.now()): CampaignResult {
  const status: Campaign["status"] = c.status === "live" && Date.parse(c.ends_at) < now ? "ended" : c.status;
  const mine = messages.filter((m) => m.campaign_id === c.id && m.status !== "skipped");
  if (mine.length === 0) return { sent: c.sent, converted: c.converted, revenue: c.revenue, cost: c.cost, status, tracked: false };
  const firstMsg = new Map<string, number>();
  for (const m of mine) {
    const t = Date.parse(m.created_at);
    if (!firstMsg.has(m.customer_id) || t < firstMsg.get(m.customer_id)!) firstMsg.set(m.customer_id, t);
  }
  const end = Math.min(Date.parse(c.ends_at), now);
  const buyers = new Set<string>();
  let revenue = 0;
  for (const v of visits) {
    const from = firstMsg.get(v.customer_id);
    const t = Date.parse(v.at);
    if (from === undefined || t < from || t > end) continue;
    buyers.add(v.customer_id);
    revenue += v.amount;
  }
  const out: CampaignResult = { sent: firstMsg.size, converted: buyers.size, revenue, cost: c.cost, status, tracked: true };

  const hold = new Set(c.holdout_ids ?? []);
  if (hold.size) {
    const from = Date.parse(c.starts_at);
    const holdBuyers = new Set<string>();
    let holdRevenue = 0;
    for (const v of visits) {
      const t = Date.parse(v.at);
      if (!hold.has(v.customer_id) || t < from || t > end) continue;
      holdBuyers.add(v.customer_id);
      holdRevenue += v.amount;
    }
    const sentRate = out.sent ? out.converted / out.sent : 0;
    const holdRate = holdBuyers.size / hold.size;
    out.control = { size: hold.size, converted: holdBuyers.size, revenue: holdRevenue };
    out.liftPts = (sentRate - holdRate) * 100;
    out.incrementalRevenue = Math.round(revenue - (holdRevenue / hold.size) * out.sent);
  }
  return out;
}
