import type {
  AutomationRule,
  Campaign,
  Coupon,
  Customer,
  Message,
  Referral,
  Reward,
  Service,
  Settings,
  Tables,
  Tier,
  Visit,
} from "./types";

// Base configuration — also mirrored in supabase/seed.sql.

export const SETTINGS: Settings = {
  id: "default",
  salon_name: "Luxe Studio",
  timezone: "Asia/Kolkata",
  whatsapp_number: "919800000000",
  booking_link: "https://luxe.studio/book",
  margin_goal_pct: 55,
  reward_budget_pct: 6,
  referral_level1_points: 100,
  referral_level2_points: 25,
  referral_milestones: [
    { count: 1, label: "+100 points", points: 100 },
    { count: 3, label: "+1,000 points", points: 1000 },
    { count: 5, label: "Special gift", points: 0 },
  ],
};

export const TIERS: Tier[] = [
  { id: "silver", name: "Silver", min_points: 0, multiplier: 1, color: "#9aa0a6", perks: ["Earn points on every service", "Birthday offer"], sort: 1 },
  { id: "gold", name: "Gold", min_points: 100, multiplier: 1.25, color: "#d4a017", perks: ["1.25× points", "Priority weekend slots", "Free hair spa every quarter"], sort: 2 },
  { id: "platinum", name: "Platinum", min_points: 220, multiplier: 1.5, color: "#6b7a8f", perks: ["1.5× points", "Complimentary add-on each visit", "Early access to new services"], sort: 3 },
  { id: "diamond", name: "Diamond", min_points: 400, multiplier: 2, color: "#5b3fd9", perks: ["2× points", "Dedicated stylist", "Luxury gift every half-year"], sort: 4 },
];

export const SERVICES: Service[] = [
  { id: "haircut", name: "Haircut", category: "Hair", price: 600, points: 5, revisit_days: 60 },
  { id: "beard", name: "Beard trim", category: "Grooming", price: 250, points: 2, revisit_days: 21 },
  { id: "colour", name: "Hair colour", category: "Hair", price: 2800, points: 20, revisit_days: 45 },
  { id: "keratin", name: "Keratin treatment", category: "Hair", price: 5500, points: 40, revisit_days: 120 },
  { id: "spa", name: "Hair spa", category: "Hair", price: 1400, points: 12, revisit_days: 30 },
  { id: "facial", name: "Facial", category: "Skin", price: 1800, points: 15, revisit_days: 30 },
  { id: "mani", name: "Manicure", category: "Nails", price: 700, points: 6, revisit_days: 21 },
  { id: "pedi", name: "Pedicure", category: "Nails", price: 900, points: 8, revisit_days: 28 },
  { id: "bridal", name: "Bridal makeup", category: "Makeup", price: 18000, points: 120, revisit_days: null },
];

export const REWARDS: Reward[] = [
  { id: "rw_beard", name: "Free beard trim", kind: "free_service", value: 250, cost_points: 40, tier_id: null, validity_days: 30, active: true, emoji: "🧔" },
  { id: "rw_150", name: "₹150 off any service", kind: "flat_off", value: 150, cost_points: 150, tier_id: null, validity_days: 14, active: true, emoji: "💸" },
  { id: "rw_spa", name: "Free hair spa", kind: "free_service", value: 1400, cost_points: 120, tier_id: "gold", validity_days: 30, active: true, emoji: "💆" },
  { id: "rw_colour10", name: "10% off hair colour", kind: "percent_off", value: 10, cost_points: 200, tier_id: "gold", validity_days: 30, active: true, emoji: "🎨" },
  { id: "rw_mani", name: "Free manicure", kind: "free_service", value: 700, cost_points: 90, tier_id: "platinum", validity_days: 30, active: true, emoji: "💅" },
  { id: "rw_kit", name: "Luxury haircare kit", kind: "gift", value: 3500, cost_points: 600, tier_id: "diamond", validity_days: 45, active: true, emoji: "🎁" },
];

export const RULES: AutomationRule[] = [
  {
    id: "rule_revisit_haircut",
    type: "revisit_reminder",
    name: "Haircut revisit reminder",
    enabled: true,
    config: { service_id: "haircut", days_after: 60, cooldown_days: 30 },
    template:
      "Hi {{first_name}} ✂️ It's been {{days}} days since your last {{service}} at {{salon}}. Ready for a fresh look? You have {{points}} points waiting. Book here: {{booking_link}}",
    send_hour: 10,
    audience: "all",
  },
  {
    id: "rule_revisit_colour",
    type: "revisit_reminder",
    name: "Root touch-up reminder",
    enabled: true,
    config: { service_id: "colour", days_after: 45, cooldown_days: 21 },
    template:
      "Hi {{first_name}} 🎨 Your {{service}} is {{days}} days old — roots usually show around now. Book a touch-up at {{salon}}: {{booking_link}}",
    send_hour: 11,
    audience: "all",
  },
  {
    id: "rule_milestone_150",
    type: "milestone_offer",
    name: "150-point milestone offer",
    enabled: true,
    config: { points_threshold: 150, discount_value: 150, validity_days: 14, deduct_points: true },
    template:
      "🎉 Congrats {{first_name}}! You've hit {{points}} points at {{salon}}. Enjoy ₹{{offer}} off any service — code {{code}}. Valid till {{expiry}} only, so don't miss it!",
    send_hour: 10,
    audience: "all",
  },
  {
    id: "rule_expiry",
    type: "expiry_nudge",
    name: "Offer expiry countdown",
    enabled: true,
    config: { days_before: [7, 3, 1] },
    template:
      "⏳ {{first_name}}, your {{offer_label}} (code {{code}}) expires in {{days_left}} day(s) — on {{expiry}}. Grab a slot before it's gone: {{booking_link}}",
    send_hour: 12,
    audience: "all",
  },
  {
    id: "rule_winback",
    type: "winback",
    name: "Win back lapsed guests",
    enabled: true,
    config: { inactive_days: 120, bonus_points: 20 },
    template:
      "We miss you, {{first_name}} 💛 We've added {{bonus}} bonus points to your {{salon}} account. Come back and treat yourself: {{booking_link}}",
    send_hour: 17,
    audience: "all",
  },
  {
    id: "rule_birthday",
    type: "birthday",
    name: "Birthday treat",
    enabled: false,
    config: { discount_value: 200, validity_days: 7 },
    template:
      "Happy birthday {{first_name}} 🎂 Here's ₹{{offer}} off from all of us at {{salon}} — code {{code}}, valid till {{expiry}}.",
    send_hour: 9,
    audience: "all",
  },
];

// ---------- Generated demo members ----------

const FIRST = [
  "Aarav", "Diya", "Sam", "Ananya", "Rohan", "Isha", "Kabir", "Meera", "Arjun", "Sara", "Vihaan", "Priya", "Aditya",
  "Neha", "Karan", "Tara", "Ishaan", "Riya", "Dev", "Kavya", "Nikhil", "Pooja", "Reyansh", "Aisha", "Varun", "Sneha",
  "Yash", "Zoya", "Manav", "Nisha", "Rahul", "Tanya", "Siddharth", "Anika", "Farhan", "Lavanya", "Omkar", "Ira",
  "Harsh", "Jiya", "Kunal", "Mira", "Aryan", "Simran", "Rehan", "Avni", "Parth", "Esha",
];
const LAST = ["Sharma", "Iyer", "Kapoor", "Nair", "Mehta", "Reddy", "Khan", "Das", "Patel", "Joshi", "Menon", "Gupta", "Bose", "Rao", "Shetty", "Malhotra"];
const FEMALE = new Set(["Diya", "Ananya", "Isha", "Meera", "Sara", "Priya", "Neha", "Tara", "Riya", "Kavya", "Pooja", "Aisha", "Sneha", "Zoya", "Nisha", "Tanya", "Anika", "Lavanya", "Ira", "Jiya", "Mira", "Simran", "Avni", "Esha"]);

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export function tierFor(lifetime: number, tiers: Tier[] = TIERS): Tier {
  return [...tiers].sort((a, b) => b.min_points - a.min_points).find((t) => lifetime >= t.min_points) ?? tiers[0];
}

export type Db = { [K in keyof Tables]: Tables[K][] };

export function buildSeed(now = Date.now()): Db {
  const rnd = prng(20260927);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const svc = (id: string) => SERVICES.find((s) => s.id === id)!;

  const customers: Customer[] = [];
  const visits: Visit[] = [];
  const coupons: Coupon[] = [];
  const messages: Message[] = [];
  const referrals: Referral[] = [];

  FIRST.forEach((first, i) => {
    const female = FEMALE.has(first);
    const id = `c_${String(i + 1).padStart(3, "0")}`;
    const last = LAST[i % LAST.length];
    const joinedDaysAgo = 60 + Math.floor(rnd() * 420);
    const joined = now - joinedDaysAgo * DAY;
    // Engagement profile: 0 = churned, 1 = regular, 2 = loyal
    const profile = i === 2 ? 2 : rnd() < 0.15 ? 0 : rnd() < 0.55 ? 1 : 2;
    const menu = female
      ? ["haircut", "colour", "spa", "facial", "mani", "pedi", ...(rnd() < 0.2 ? ["keratin"] : [])]
      : ["haircut", "beard", "spa", "facial", ...(rnd() < 0.3 ? ["colour"] : [])];

    let lifetime = 0;
    let spend = 0;
    let count = 0;
    let lastVisit: number | null = null;

    // Haircut cadence drives the demo: ~55–75 days for regulars, faster for loyal guests.
    const cadence = profile === 2 ? 35 + rnd() * 15 : 55 + rnd() * 20;
    const stopAt = profile === 0 ? now - (130 + rnd() * 90) * DAY : now - rnd() * 20 * DAY;
    let t = joined;
    let v = 0;
    while (t < stopAt) {
      const extras = profile === 2 ? 2 : 1;
      const booked = ["haircut", ...Array.from({ length: extras }, () => pick(menu))];
      for (const sid of new Set(booked)) {
        const s = svc(sid);
        const tier = tierFor(lifetime);
        const pts = Math.round(s.points * tier.multiplier);
        visits.push({ id: `v_${id}_${v++}`, customer_id: id, service_id: sid, amount: s.price, points_earned: pts, at: iso(t) });
        lifetime += pts;
        spend += s.price;
      }
      count++;
      lastVisit = t;
      t += cadence * DAY * (0.85 + rnd() * 0.3);
    }

    // Sam (i=2) is the story from the brief: last haircut 61 days ago, sitting just under 150 points.
    if (i === 2) {
      const samVisits = visits.filter((x) => x.customer_id === id);
      const shift = now - 61 * DAY - (lastVisit ?? now);
      samVisits.forEach((x) => (x.at = iso(new Date(x.at).getTime() + shift)));
      lastVisit = now - 61 * DAY;
    }

    const redeemed = profile === 2 && lifetime > 250 ? 150 : 0;
    const tier = tierFor(lifetime);
    customers.push({
      id,
      name: `${first} ${last}`,
      phone: `9198${String(10000000 + Math.floor(rnd() * 89999999)).slice(0, 8)}`,
      email: rnd() < 0.7 ? `${first.toLowerCase()}.${last.toLowerCase()}@example.com` : null,
      gender: female ? "female" : "male",
      birthday: `199${Math.floor(rnd() * 10)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
      channel: pick(["app", "whatsapp", "whatsapp", "walk_in", "pos"] as const),
      kyc_status: rnd() < 0.82 ? "verified" : "pending",
      pan: rnd() < 0.3 ? `ABCP${String.fromCharCode(65 + (i % 26))}${String(1000 + i).slice(-4)}K` : null,
      is_business: i % 11 === 4, // a few stylists/influencers who partner with the salon
      whatsapp_opt_in: rnd() < 0.9,
      points: lifetime - redeemed,
      lifetime_points: lifetime,
      tier_id: tier.id,
      referral_code: `${first.toUpperCase().slice(0, 4)}${String(1000 + i * 37).slice(-4)}`,
      referred_by: null,
      segment: [
        ...(female ? ["women"] : ["men"]),
        ...(profile === 0 ? ["lapsed"] : []),
        ...(profile === 2 ? ["high_value"] : []),
        ...(spend > 30000 ? ["vip"] : []),
      ],
      joined_at: iso(joined),
      last_visit_at: lastVisit ? iso(lastVisit) : null,
      total_spend: spend,
      visit_count: count,
    });

    if (redeemed) {
      coupons.push({
        id: `cp_r_${id}`,
        code: `LUXE${(1000 + i * 13).toString(36).toUpperCase()}`,
        customer_id: id,
        reward_id: "rw_150",
        label: "₹150 off any service",
        value: 150,
        source: "milestone",
        status: "redeemed",
        issued_at: iso(now - 50 * DAY),
        expires_at: iso(now - 36 * DAY),
        redeemed_at: iso(now - 40 * DAY),
      });
    }
  });

  // Keep Sam's balance at 145 so the next haircut (5 pts) triggers the ₹150 offer.
  const sam = customers[2];
  sam.points = 145;
  sam.lifetime_points = Math.max(sam.lifetime_points, 145);
  sam.tier_id = tierFor(sam.lifetime_points).id;
  sam.name = "Sam Kapoor";
  sam.whatsapp_opt_in = true;

  // A few live offers at different points of the expiry countdown.
  [
    { c: 5, days: 3 },
    { c: 9, days: 1 },
    { c: 14, days: 7 },
    { c: 21, days: 11 },
  ].forEach(({ c, days }, k) => {
    coupons.push({
      id: `cp_live_${k}`,
      code: `LUXE${(7000 + c * 17).toString(36).toUpperCase()}`,
      customer_id: customers[c].id,
      reward_id: "rw_150",
      label: "₹150 off any service",
      value: 150,
      source: "milestone",
      status: "active",
      issued_at: iso(now - (14 - days) * DAY),
      expires_at: iso(now + days * DAY - 3_600_000),
      redeemed_at: null,
    });
  });

  // Business partners accumulate larger benefits.
  customers
    .filter((c) => c.is_business)
    .forEach((c, k) => {
      // Two partners: one under the ₹20k threshold, one over it. Dated earlier in the FY.
      if (k > 1) return;
      for (let j = 0; j < 3 + k * 4; j++) {
        coupons.push({
          id: `cp_b_${c.id}_${j}`,
          code: `COLLAB${k}${j}`,
          customer_id: c.id,
          reward_id: j % 2 ? "rw_kit" : null,
          label: j % 2 ? "Luxury haircare kit" : "Complimentary styling session",
          value: j % 2 ? 3500 : 4500,
          source: "campaign",
          status: "redeemed",
          issued_at: iso(now - (105 + j * 11) * DAY),
          expires_at: iso(now - (90 + j * 11) * DAY),
          redeemed_at: iso(now - (95 + j * 11) * DAY),
        });
      }
    });

  // Referral tree: a handful of advocates bringing friends, some friends bringing friends (level 2).
  const advocates = [0, 2, 7, 11, 19];
  let r = 0;
  advocates.forEach((a, k) => {
    const n = [6, 4, 3, 2, 1][k];
    for (let j = 0; j < n; j++) {
      const referee = customers[(a + 5 + j * 3 + k) % customers.length];
      if (referee.id === customers[a].id || referee.referred_by) continue;
      referee.referred_by = customers[a].id;
      const status = j < n - 1 ? "rewarded" : "pending";
      referrals.push({
        id: `rf_${r++}`,
        referrer_id: customers[a].id,
        referee_id: referee.id,
        level: 1,
        status,
        points_awarded: status === "rewarded" ? SETTINGS.referral_level1_points : 0,
        created_at: iso(now - (10 + r * 9) * DAY),
      });
      const grand = customers.find((c) => c.id === customers[a].referred_by);
      if (grand) {
        referrals.push({
          id: `rf_${r++}`,
          referrer_id: grand.id,
          referee_id: referee.id,
          level: 2,
          status,
          points_awarded: status === "rewarded" ? SETTINGS.referral_level2_points : 0,
          created_at: iso(now - (10 + r * 9) * DAY),
        });
      }
    }
  });

  // Message history so the Outbox isn't empty.
  customers.slice(20, 32).forEach((c, k) => {
    messages.push({
      id: `m_h_${k}`,
      customer_id: c.id,
      rule_id: k % 3 === 0 ? "rule_expiry" : "rule_revisit_haircut",
      campaign_id: null,
      dedupe_key: `hist:${c.id}:${k}`,
      body: `Hi ${c.name.split(" ")[0]} ✂️ It's been 60 days since your last Haircut at Luxe Studio. Ready for a fresh look?`,
      status: "sent",
      created_at: iso(now - (k + 2) * DAY),
      sent_at: iso(now - (k + 2) * DAY + 3_600_000),
      error: null,
    });
  });

  const campaigns: Campaign[] = [
    { id: "cmp_monsoon", name: "Monsoon hair-spa week", segment: "women", member_ids: [], channel: "whatsapp", offer: "Hair spa at ₹999 + 2× points", status: "ended", starts_at: iso(now - 70 * DAY), ends_at: iso(now - 63 * DAY), sent: 412, converted: 58, revenue: 71400, cost: 3900 },
    { id: "cmp_groom", name: "Groom-ready combo", segment: "men", member_ids: [], channel: "whatsapp", offer: "Haircut + beard + facial ₹1,999", status: "live", starts_at: iso(now - 6 * DAY), ends_at: iso(now + 8 * DAY), sent: 268, converted: 31, revenue: 61969, cost: 2600 },
    { id: "cmp_vip", name: "VIP colour preview", segment: "vip", member_ids: [], channel: "app", offer: "Free gloss with any colour", status: "live", starts_at: iso(now - 3 * DAY), ends_at: iso(now + 11 * DAY), sent: 64, converted: 12, revenue: 38400, cost: 1100 },
    { id: "cmp_lapsed", name: "We miss you — 120 day lapse", segment: "lapsed", member_ids: [], channel: "whatsapp", offer: "₹300 off + 20 bonus points", status: "scheduled", starts_at: iso(now + 2 * DAY), ends_at: iso(now + 16 * DAY), sent: 0, converted: 0, revenue: 0, cost: 0 },
  ];

  return {
    settings: [SETTINGS],
    tiers: TIERS,
    services: SERVICES,
    rewards: REWARDS,
    automation_rules: RULES,
    customers,
    visits,
    coupons,
    messages,
    referrals,
    campaigns,
    managers: [], // demo manager is added in lib/db.ts (needs hashing)
    login_attempts: [],
    whatsapp_connection: [
      {
        id: "default",
        mode: "click_to_chat",
        phone: SETTINGS.whatsapp_number,
        phone_confirmed: false,
        status: "not_connected",
        connected_via: null,
        phone_number_id: null,
        waba_id: null,
        access_token_enc: null,
        app_secret_enc: null,
        webhook_verify_token: "demo-verify-token",
        verified_name: null,
        display_phone: null,
        last_error: null,
        connected_at: null,
      },
    ],
  };
}
