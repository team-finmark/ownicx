import { fail, json, readJson, reqStr, requireApiKey } from "@/lib/api";
import { redeemCouponByCode } from "@/lib/loyalty";

// Body: { "code": "OWNK7QX2P", "bill": 2800 }  — bill is required for %-off coupons.
export async function POST(req: Request) {
  const denied = requireApiKey(req);
  if (denied) return denied;
  const b = await readJson(req);
  if (b instanceof Response) return b;
  try {
    const cp = await redeemCouponByCode(reqStr(b.code, "code", 40), b.bill);
    return json({ code: cp.code, label: cp.label, value: cp.value, redeemed_at: cp.redeemed_at });
  } catch (e) {
    return fail(e, e instanceof Error && /^No coupon/.test(e.message) ? 404 : e instanceof Error && /bill amount/.test(e.message) ? 400 : 409);
  }
}
