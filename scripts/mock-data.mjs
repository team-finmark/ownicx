// Demo members with realistic visit histories and personalised WhatsApp messages queued in the Outbox.
//   npm run mock            → (re)create the 10 mock members
//   npm run mock -- remove  → delete them (and their visits, coupons, messages) + the demo campaign
//
// Every mock member carries the segment tag "mock": the Outbox won't offer "Send on WhatsApp" for them
// and automatic sending skips them, so made-up numbers are never messaged.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const id = (p) => `${p}_${randomBytes(6).toString("hex")}`;
const istDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(t));
const fmtDate = (t) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(t));
const render = (tpl, vars) => tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in vars ? String(vars[k]) : `{{${k}}}`));
const code = (prefix = "OWN") => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return prefix + [...randomBytes(6)].map((b) => abc[b % abc.length]).join("");
};
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const CAMPAIGN_NAME = "Festive glow-up week (demo)";
const CAMPAIGN_TEMPLATE = "Hi {{first_name}} ✨ {{offer}} at {{salon}} — just for you. Book: {{booking_link}}";

// Who they are and why a message is waiting for them.
const PEOPLE = [
  { name: "Arjun Mehta", gender: "male", phone: "919000010101", channel: "walk_in", scenario: "haircut", lastDays: 63 },
  { name: "Rohan Gupta", gender: "male", phone: "919000010102", channel: "whatsapp", scenario: "haircut", lastDays: 68 },
  { name: "Karan Malhotra", gender: "male", phone: "919000010103", channel: "app", scenario: "haircut", lastDays: 61 },
  { name: "Vikram Singh", gender: "male", phone: "919000010104", channel: "pos", scenario: "winback", lastDays: 132 },
  { name: "Aditya Rao", gender: "male", phone: "919000010105", channel: "whatsapp", scenario: "milestone" },
  { name: "Priya Sharma", gender: "female", phone: "919000010201", channel: "app", scenario: "colour", lastDays: 47 },
  { name: "Meera Nair", gender: "female", phone: "919000010202", channel: "walk_in", scenario: "colour", lastDays: 52 },
  { name: "Kavya Reddy", gender: "female", phone: "919000010203", channel: "whatsapp", scenario: "milestone" },
  { name: "Ananya Iyer", gender: "female", phone: "919000010204", channel: "app", scenario: "expiry" },
  { name: "Riya Kapoor", gender: "female", phone: "919000010205", channel: "pos", scenario: "campaign" },
];

async function remove() {
  // segment is jsonb, so the containment filter must be JSON text, not an array literal.
  const mocks = must(await sb.from("customers").select("id, name").contains("segment", JSON.stringify(["mock"])), "find mock members");
  if (mocks.length) {
    const ids = mocks.map((m) => m.id);
    // Visits/coupons/messages/referrals cascade on delete; clear referral links first.
    must(await sb.from("customers").update({ referred_by: null }).in("referred_by", ids), "unlink referrals");
    must(await sb.from("customers").delete().in("id", ids), "delete mock members");
  }
  must(await sb.from("campaigns").delete().eq("name", CAMPAIGN_NAME), "delete demo campaign");
  console.log(`Removed ${mocks.length} mock member(s)${mocks.length ? `: ${mocks.map((m) => m.name).join(", ")}` : ""}.`);
}

async function add() {
  await remove();
  const [rulesRows, services, tiers, settings] = await Promise.all([
    sb.from("automation_rules").select("*").then((r) => must(r, "rules")),
    sb.from("services").select("*").then((r) => must(r, "services")),
    sb.from("tiers").select("*").order("min_points").then((r) => must(r, "tiers")),
    sb.from("settings").select("*").limit(1).single().then((r) => must(r, "settings")),
  ]);
  const rules = Object.fromEntries(rulesRows.map((r) => [r.id, r]));
  const svc = Object.fromEntries(services.map((s) => [s.id, s]));
  const tierFor = (lifetime) => [...tiers].reverse().find((t) => lifetime >= t.min_points) ?? tiers[0];
  const needRule = (rid) => {
    if (!rules[rid]) throw new Error(`Rule ${rid} is missing — run supabase/seed.sql first`);
    return rules[rid];
  };

  const customers = [];
  const visits = [];
  const coupons = [];
  const messages = [];
  let campaign = null;

  for (const [i, p] of PEOPLE.entries()) {
    const cid = id("c");
    const first = p.name.split(" ")[0];
    const female = p.gender === "female";

    // ---- visit history (oldest first), points earned at the tier they were in at the time ----
    const plan = []; // [daysAgo, serviceId]
    if (p.scenario === "haircut") for (const d of [p.lastDays + 300, p.lastDays + 238, p.lastDays + 178, p.lastDays + 117, p.lastDays + 58, p.lastDays]) plan.push([d, "haircut"], ...(d % 2 ? [[d, "beard"]] : []));
    if (p.scenario === "colour") for (const d of [p.lastDays + 220, p.lastDays + 140, p.lastDays + 90, p.lastDays + 44, p.lastDays]) plan.push([d, "colour"], ...(d === p.lastDays ? [[d, "haircut"]] : [[d, "spa"]]));
    if (p.scenario === "winback") for (const d of [p.lastDays + 260, p.lastDays + 190, p.lastDays + 125, p.lastDays + 60, p.lastDays]) plan.push([d, "haircut"], [d, "beard"]);
    if (p.scenario === "milestone") {
      const menu = female ? ["colour", "facial", "spa", "haircut", "mani"] : ["haircut", "facial", "spa", "beard", "colour"];
      for (let k = 0; k < 9; k++) plan.push([300 - k * 33, menu[k % menu.length]], [300 - k * 33, "haircut"]);
    }
    if (p.scenario === "expiry") for (const d of [210, 160, 118, 75, 33, 12]) plan.push([d, d % 2 ? "facial" : "colour"], [d, "spa"]);
    if (p.scenario === "campaign") for (const d of [190, 130, 82, 40, 9]) plan.push([d, "facial"], [d, "mani"]);

    let lifetime = 0;
    let spend = 0;
    const myVisits = [];
    for (const [daysAgo, sid] of plan.sort((a, b) => b[0] - a[0])) {
      const s = svc[sid];
      if (!s) continue;
      const pts = Math.round(s.points * Number(tierFor(lifetime).multiplier));
      const at = NOW - daysAgo * DAY + (10 + (i % 7)) * 3600_000; // daytime appointments
      const v = { id: id("v"), customer_id: cid, service_id: sid, amount: Number(s.price), points_earned: pts, at: iso(at) };
      myVisits.push(v);
      lifetime += pts;
      spend += Number(s.price);
    }
    const days = new Set(myVisits.map((v) => istDay(v.at)));
    const lastVisit = myVisits.reduce((m, v) => (v.at > m ? v.at : m), myVisits[0].at);
    let points = lifetime;
    const c = {
      id: cid,
      name: p.name,
      phone: p.phone,
      email: `${first.toLowerCase()}.${p.name.split(" ")[1].toLowerCase()}@example.com`,
      gender: p.gender,
      birthday: `199${(i * 3) % 10}-${String(1 + ((i * 5) % 12)).padStart(2, "0")}-${String(3 + i * 2).padStart(2, "0")}`,
      channel: p.channel,
      kyc_status: "verified",
      pan: null,
      is_business: false,
      whatsapp_opt_in: true,
      points,
      lifetime_points: lifetime,
      tier_id: tierFor(lifetime).id,
      referral_code: `${first.toUpperCase().slice(0, 4)}${randomBytes(2).readUInt16BE(0) % 9000 + 1000}`,
      referred_by: null,
      segment: [female ? "women" : "men", "mock", ...(spend > 30000 ? ["vip"] : []), ...(p.scenario === "winback" ? ["lapsed"] : [])],
      joined_at: iso(NOW - 330 * DAY),
      last_visit_at: lastVisit,
      total_spend: spend,
      visit_count: days.size,
    };
    const base = { first_name: first, salon: settings.salon_name, points: c.points, tier: tierFor(lifetime).name, booking_link: settings.booking_link };
    const msg = (rule, body, dedupe, extra = {}) =>
      messages.push({ id: id("m"), customer_id: cid, rule_id: rule?.id ?? null, campaign_id: null, dedupe_key: dedupe, body, status: "queued", created_at: iso(NOW - (10 - i) * 60_000), sent_at: null, error: null, template: null, attempts: 0, ...extra });

    // ---- the personalised message waiting for them (same variables the automation engine uses) ----
    if (p.scenario === "haircut" || p.scenario === "colour") {
      const rule = needRule(p.scenario === "haircut" ? "rule_revisit_haircut" : "rule_revisit_colour");
      const target = rule.config.service_id;
      const last = myVisits.filter((v) => v.service_id === target).sort((a, b) => b.at.localeCompare(a.at))[0];
      const d = Math.floor((NOW - Date.parse(last.at)) / DAY);
      msg(rule, render(rule.template, { ...base, service: svc[target].name, days: d }), `revisit:${rule.id}:${last.id}:0`);
    }
    if (p.scenario === "milestone") {
      const rule = needRule("rule_milestone_150");
      const cfg = rule.config;
      // Make sure the balance has crossed the threshold.
      if (c.points < cfg.points_threshold) {
        const extra = svc.keratin ?? svc.colour;
        const v = { id: id("v"), customer_id: cid, service_id: extra.id, amount: Number(extra.price), points_earned: extra.points, at: iso(NOW - 2 * DAY) };
        myVisits.push(v);
        c.points += extra.points;
        c.lifetime_points += extra.points;
        c.total_spend += Number(extra.price);
        c.visit_count += 1;
        c.last_visit_at = v.at;
        c.tier_id = tierFor(c.lifetime_points).id;
      }
      const expires = NOW + cfg.validity_days * DAY;
      const cp = { id: id("cp"), code: code(), customer_id: cid, reward_id: null, label: `₹${cfg.discount_value} off any service`, value: cfg.discount_value, source: "milestone", status: "active", issued_at: iso(NOW - 5 * 60_000), expires_at: iso(expires), redeemed_at: null };
      coupons.push(cp);
      const pointsBefore = c.points;
      if (cfg.deduct_points) c.points -= cfg.points_threshold;
      msg(rule, render(rule.template, { ...base, points: pointsBefore, tier: tierFor(c.lifetime_points).name, offer: cfg.discount_value, offer_label: cp.label, code: cp.code, expiry: fmtDate(expires) }), `milestone:${rule.id}:${cid}:${Math.floor(c.lifetime_points / cfg.points_threshold)}`);
    }
    if (p.scenario === "expiry") {
      const rule = needRule("rule_expiry");
      const expires = NOW + 3 * DAY - 2 * 3600_000;
      const cp = { id: id("cp"), code: code(), customer_id: cid, reward_id: null, label: "₹150 off any service", value: 150, source: "milestone", status: "active", issued_at: iso(NOW - 11 * DAY), expires_at: iso(expires), redeemed_at: null };
      coupons.push(cp);
      const bucket = [...rule.config.days_before].sort((a, b) => a - b).find((d) => 3 <= d) ?? 3;
      msg(rule, render(rule.template, { ...base, offer: 150, offer_label: cp.label, code: cp.code, expiry: fmtDate(expires), days_left: 3 }), `expiry:${cp.id}:${istDay(expires)}:${bucket}`);
    }
    if (p.scenario === "winback") {
      const rule = needRule("rule_winback");
      const bonus = rule.config.bonus_points;
      c.points += bonus; // win-back bonus doesn't raise lifetime points
      const d = Math.floor((NOW - Date.parse(c.last_visit_at)) / DAY);
      msg(rule, render(rule.template, { ...base, points: c.points, bonus, days: d }), `winback:${rule.id}:${cid}:${c.last_visit_at.slice(0, 10)}`);
    }
    if (p.scenario === "campaign") {
      campaign = {
        id: id("cmp"),
        name: CAMPAIGN_NAME,
        segment: "members",
        member_ids: [cid],
        channel: "whatsapp",
        offer: "Facial + hair spa at ₹2,499 and 2× points",
        status: "live",
        starts_at: iso(NOW - 15 * 60_000),
        ends_at: iso(NOW + 7 * DAY),
        sent: 1,
        converted: 0,
        revenue: 0,
        cost: 0,
        wa_template: null,
        holdout_pct: 0,
        holdout_ids: [],
      };
      msg(null, render(CAMPAIGN_TEMPLATE, { ...base, offer: campaign.offer }), `campaign:${campaign.id}:${cid}`, { campaign_id: campaign.id });
    }

    visits.push(...myVisits);
    customers.push(c);
  }

  must(await sb.from("customers").insert(customers), "insert members");
  must(await sb.from("visits").insert(visits), "insert visits");
  if (coupons.length) must(await sb.from("coupons").insert(coupons), "insert coupons");
  if (campaign) must(await sb.from("campaigns").insert(campaign), "insert campaign");
  must(await sb.from("messages").insert(messages), "insert messages");

  console.log(`Created ${customers.length} mock members, ${visits.length} visits, ${coupons.length} coupons, ${messages.length} queued messages:\n`);
  for (const c of customers) {
    const m = messages.find((x) => x.customer_id === c.id);
    console.log(`• ${c.name.padEnd(15)} ${tiers.find((t) => t.id === c.tier_id).name.padEnd(9)} ${String(c.points).padStart(4)} pts  →  ${m.body.slice(0, 95)}${m.body.length > 95 ? "…" : ""}`);
  }
}

const mode = process.argv[2] ?? "add";
(mode === "remove" ? remove() : add()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
