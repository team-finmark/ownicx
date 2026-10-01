import { BadInput, fail, json, optBool, optStr, phoneStr, readJson, reqStr, requireApiKey } from "@/lib/api";
import * as db from "@/lib/db";
import { normalisePhone } from "@/lib/engine";
import { onboardCustomer } from "@/lib/loyalty";
import type { Channel, Customer } from "@/lib/types";

const CHANNELS: Channel[] = ["app", "whatsapp", "walk_in", "pos"];
const GENDERS = ["female", "male", "other"];

export async function GET(req: Request) {
  const denied = await requireApiKey(req);
  if (denied) return denied;
  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) return fail(new BadInput("phone query parameter is required"));
  const [c] = await db.query("customers", { eq: { phone: normalisePhone(phone) }, limit: 1 });
  if (!c) return json({ error: "Not found" }, 404);
  const [tiers, coupons] = await Promise.all([db.list("tiers"), db.query("coupons", { eq: { customer_id: c.id, status: "active" } })]);
  return json({
    id: c.id,
    name: c.name,
    points: c.points,
    lifetime_points: c.lifetime_points,
    tier: tiers.find((t) => t.id === c.tier_id)?.name,
    referral_code: c.referral_code,
    active_coupons: coupons.map(({ code, label, value, expires_at }) => ({ code, label, value, expires_at })),
  });
}

export async function POST(req: Request) {
  const denied = await requireApiKey(req);
  if (denied) return denied;
  const b = await readJson(req);
  if (b instanceof Response) return b;
  try {
    const name = reqStr(b.name, "name", 100);
    const phone = phoneStr(b.phone);
    if (!phone) throw new BadInput("phone is required");
    const channel = (optStr(b.channel, "channel", 20) ?? "app") as Channel;
    if (!CHANNELS.includes(channel)) throw new BadInput(`channel must be one of ${CHANNELS.join(", ")}`);
    const gender = optStr(b.gender, "gender", 10);
    if (gender && !GENDERS.includes(gender)) throw new BadInput(`gender must be one of ${GENDERS.join(", ")}`);
    const birthday = optStr(b.birthday, "birthday", 10);
    if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(birthday)))) throw new BadInput("birthday must be YYYY-MM-DD");
    const email = optStr(b.email, "email", 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadInput("email doesn't look valid");

    const { customer, kyc } = await onboardCustomer({
      name,
      phone,
      email,
      gender: gender as Customer["gender"],
      birthday,
      channel,
      pan: optStr(b.pan, "pan", 10),
      is_business: optBool(b.is_business, "is_business"),
      whatsapp_opt_in: optBool(b.whatsapp_opt_in, "whatsapp_opt_in"),
      referral_code: optStr(b.referral_code_used, "referral_code_used", 20),
    });
    return json({ id: customer.id, referral_code: customer.referral_code, kyc_status: customer.kyc_status, kyc_issues: kyc.issues }, 201);
  } catch (e) {
    // Duplicate phone / unknown referral code are conflicts; everything else is bad input.
    return fail(e, e instanceof Error && /already exists|Referral code/.test(e.message) ? 409 : 400);
  }
}
