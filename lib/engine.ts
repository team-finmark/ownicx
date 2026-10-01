// Loyalty logic engine — pure functions, no I/O. Everything here is deterministic given
// (database snapshot, now), which is what makes the "preview today's sends" screen honest.

import type {
  AutomationRule,
  BirthdayConfig,
  Coupon,
  Customer,
  ExpiryConfig,
  Message,
  MilestoneConfig,
  RevisitConfig,
  Service,
  Settings,
  Tier,
  Visit,
  WinbackConfig,
} from "./types";

export const DAY = 86_400_000;

/** Calendar date (YYYY-MM-DD) in India time — the salon's day, not the server's (UTC on Vercel). */
export function istDay(t: string | number | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(t));
}
/** "YYYY-M" month key in India time (month is 0-based, matching lastMonths()). */
export function istMonthKey(t: string | number | Date) {
  const [y, m] = istDay(t).split("-").map(Number);
  return `${y}-${m - 1}`;
}

export const daysSince = (isoDate: string, now: number) => Math.floor((now - new Date(isoDate).getTime()) / DAY);

export function tierFor(lifetime: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => b.min_points - a.min_points);
  return sorted.find((t) => lifetime >= t.min_points) ?? sorted[sorted.length - 1];
}

export function nextTier(current: Tier, tiers: Tier[]): Tier | null {
  return [...tiers].sort((a, b) => a.min_points - b.min_points).find((t) => t.min_points > current.min_points) ?? null;
}

export function pointsForVisit(service: Service, tier: Tier) {
  return Math.round(service.points * tier.multiplier);
}

export function couponCode(prefix = "OWN") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion at the counter
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${prefix}${s}`;
}

export function formatDate(d: string | number | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(new Date(d));
}

export function localHour(now: number, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date(now)));
}

export function renderTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`));
}

export const TEMPLATE_VARS: Record<string, string> = {
  first_name: "Guest's first name",
  salon: "Salon name",
  service: "Service name (revisit rules)",
  days: "Days since last visit",
  points: "Current points balance",
  offer: "Offer value in ₹",
  offer_label: "Offer title",
  code: "Coupon code",
  expiry: "Offer expiry date",
  days_left: "Days until expiry",
  bonus: "Bonus points (win-back)",
  tier: "Current tier",
  booking_link: "Your booking link",
};

function inAudience(c: Customer, audience: string) {
  if (!audience || audience === "all") return true;
  if (audience.startsWith("tier:")) return c.tier_id === audience.slice(5);
  return c.segment.includes(audience);
}

export interface Snapshot {
  customers: Customer[];
  services: Service[];
  visits: Visit[];
  tiers: Tier[];
  coupons: Coupon[];
  messages: Message[];
  rules: AutomationRule[];
  settings: Settings;
}

export interface PlannedSend {
  rule: AutomationRule;
  customer: Customer;
  dedupe_key: string;
  body: string;
  vars: Record<string, string | number>; // what filled the message (also fills a Meta template)
  reason: string;
  newCoupon?: Coupon;
  pointsDelta?: number;
}

export interface PlanOptions {
  now: number;
  /** Only rules whose send_hour matches the salon's local hour (hourly cron). */
  respectSendHour?: boolean;
}

export function planAutomations(s: Snapshot, { now, respectSendHour = false }: PlanOptions): PlannedSend[] {
  const sentKeys = new Set(s.messages.map((m) => m.dedupe_key));
  const hour = localHour(now, s.settings.timezone);
  const tierById = new Map(s.tiers.map((t) => [t.id, t]));
  const serviceById = new Map(s.services.map((x) => [x.id, x]));
  const visitsByCustomer = new Map<string, Visit[]>();
  for (const v of s.visits) {
    const arr = visitsByCustomer.get(v.customer_id) ?? [];
    arr.push(v);
    visitsByCustomer.set(v.customer_id, arr);
  }
  for (const arr of visitsByCustomer.values()) arr.sort((a, b) => b.at.localeCompare(a.at));

  const out: PlannedSend[] = [];
  // Renders the text and remembers the variables for template sending; `vars` is attached in push().
  let lastVars: Record<string, string | number> = {};
  const withVars = (tpl: string, vars: Record<string, string | number>) => {
    lastVars = vars;
    return renderTemplate(tpl, vars);
  };
  const base = (c: Customer) => ({
    first_name: c.name.split(" ")[0],
    salon: s.settings.salon_name,
    points: c.points,
    tier: tierById.get(c.tier_id)?.name ?? "",
    booking_link: s.settings.booking_link,
  });
  const push = (p: Omit<PlannedSend, "vars">) => {
    if (sentKeys.has(p.dedupe_key)) return;
    sentKeys.add(p.dedupe_key);
    out.push({ ...p, vars: lastVars });
  };

  for (const rule of s.rules) {
    if (!rule.enabled) continue;
    if (respectSendHour && rule.send_hour !== hour) continue;
    const eligible = s.customers.filter((c) => c.whatsapp_opt_in && inAudience(c, rule.audience));

    switch (rule.type) {
      case "revisit_reminder": {
        const cfg = rule.config as RevisitConfig;
        for (const c of eligible) {
          const visits = visitsByCustomer.get(c.id) ?? [];
          const last = cfg.service_id === "any" ? visits[0] : visits.find((v) => v.service_id === cfg.service_id);
          if (!last) continue;
          // Don't nag someone who was in the chair this week.
          if (visits[0] && daysSince(visits[0].at, now) < 7) continue;
          const days = daysSince(last.at, now);
          if (days < cfg.days_after) continue;
          // One nudge per cooldown window, max 3 nudges per cycle — after that win-back takes over.
          const wave = Math.floor((days - cfg.days_after) / Math.max(1, cfg.cooldown_days));
          if (wave > 2) continue;
          const service = serviceById.get(last.service_id);
          push({
            rule,
            customer: c,
            dedupe_key: `revisit:${rule.id}:${last.id}:${wave}`,
            reason: `Last ${service?.name ?? "visit"} ${days} days ago${wave ? ` · follow-up #${wave}` : ""}`,
            body: withVars(rule.template, { ...base(c), service: service?.name ?? "visit", days }),
          });
        }
        break;
      }

      case "milestone_offer": {
        const cfg = rule.config as MilestoneConfig;
        for (const c of eligible) {
          if (c.points < cfg.points_threshold) continue;
          const hasLive = s.coupons.some((cp) => cp.customer_id === c.id && cp.source === "milestone" && cp.status === "active");
          if (hasLive) continue;
          const expires = now + cfg.validity_days * DAY;
          const coupon: Coupon = {
            id: `cp_${crypto.randomUUID().slice(0, 12)}`,
            code: couponCode(),
            customer_id: c.id,
            reward_id: null,
            label: `₹${cfg.discount_value} off any service`,
            value: cfg.discount_value,
            source: "milestone",
            status: "active",
            issued_at: new Date(now).toISOString(),
            expires_at: new Date(expires).toISOString(),
            redeemed_at: null,
          };
          push({
            rule,
            customer: c,
            dedupe_key: `milestone:${rule.id}:${c.id}:${Math.floor(c.lifetime_points / cfg.points_threshold)}`,
            reason: `${c.points} pts ≥ ${cfg.points_threshold} → ₹${cfg.discount_value} off, ${cfg.validity_days}-day expiry`,
            body: withVars(rule.template, {
              ...base(c),
              offer: cfg.discount_value,
              offer_label: coupon.label,
              code: coupon.code,
              expiry: formatDate(expires),
            }),
            newCoupon: coupon,
            pointsDelta: cfg.deduct_points ? -cfg.points_threshold : 0,
          });
        }
        break;
      }

      case "expiry_nudge": {
        const cfg = rule.config as ExpiryConfig;
        const buckets = [...cfg.days_before].sort((a, b) => a - b);
        for (const cp of s.coupons) {
          if (cp.status !== "active" || !cp.customer_id) continue;
          const c = eligible.find((x) => x.id === cp.customer_id);
          if (!c) continue;
          const left = Math.ceil((new Date(cp.expires_at).getTime() - now) / DAY);
          if (left < 0) continue;
          // Smallest bucket that still covers `left`: a missed run still sends the right nudge.
          const bucket = buckets.find((d) => left <= d);
          if (bucket === undefined) continue;
          push({
            rule,
            customer: c,
            dedupe_key: `expiry:${cp.id}:${istDay(cp.expires_at)}:${bucket}`,
            reason: `${cp.code} expires in ${left} day(s)`,
            body: withVars(rule.template, {
              ...base(c),
              offer: cp.value,
              offer_label: cp.label,
              code: cp.code,
              expiry: formatDate(cp.expires_at),
              days_left: Math.max(left, 0),
            }),
          });
        }
        break;
      }

      case "winback": {
        const cfg = rule.config as WinbackConfig;
        for (const c of eligible) {
          if (!c.last_visit_at) continue;
          const days = daysSince(c.last_visit_at, now);
          if (days < cfg.inactive_days) continue;
          push({
            rule,
            customer: c,
            dedupe_key: `winback:${rule.id}:${c.id}:${c.last_visit_at.slice(0, 10)}`,
            reason: `No visit for ${days} days`,
            body: withVars(rule.template, { ...base(c), points: c.points + cfg.bonus_points, bonus: cfg.bonus_points, days }),
            pointsDelta: cfg.bonus_points,
          });
        }
        break;
      }

      case "birthday": {
        const cfg = rule.config as BirthdayConfig;
        const today = formatDate(now, { month: "2-digit", day: "2-digit" });
        const year = formatDate(now, { year: "numeric" });
        for (const c of eligible) {
          if (!c.birthday) continue;
          const [, m, d] = c.birthday.split("-");
          if (formatDate(new Date(`2000-${m}-${d}T12:00:00+05:30`), { month: "2-digit", day: "2-digit" }) !== today) continue;
          const expires = now + cfg.validity_days * DAY;
          const coupon: Coupon = {
            id: `cp_bday_${c.id}_${year}`,
            code: couponCode("BDAY"),
            customer_id: c.id,
            reward_id: null,
            label: `₹${cfg.discount_value} birthday treat`,
            value: cfg.discount_value,
            source: "campaign",
            status: "active",
            issued_at: new Date(now).toISOString(),
            expires_at: new Date(expires).toISOString(),
            redeemed_at: null,
          };
          push({
            rule,
            customer: c,
            dedupe_key: `birthday:${rule.id}:${c.id}:${year}`,
            reason: "Birthday today",
            body: withVars(rule.template, { ...base(c), offer: cfg.discount_value, code: coupon.code, expiry: formatDate(expires), offer_label: coupon.label }),
            newCoupon: coupon,
          });
        }
        break;
      }
    }
  }
  return out;
}

// ---------- Phone ----------

export function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
