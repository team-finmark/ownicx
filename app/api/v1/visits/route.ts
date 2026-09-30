import { BadInput, fail, json, optStr, phoneStr, readJson, reqStr, requireApiKey } from "@/lib/api";
import * as db from "@/lib/db";
import { normalisePhone } from "@/lib/engine";
import { recordVisit } from "@/lib/loyalty";

export async function POST(req: Request) {
  const denied = requireApiKey(req);
  if (denied) return denied;
  const b = await readJson(req);
  if (b instanceof Response) return b;
  try {
    const serviceId = reqStr(b.service_id, "service_id", 60);
    let id = optStr(b.customer_id, "customer_id", 60);
    const phone = phoneStr(b.phone);
    if (!id && !phone) throw new BadInput("customer_id or phone is required");
    if (b.amount !== undefined && b.amount !== null && typeof b.amount !== "number" && typeof b.amount !== "string") throw new BadInput("amount must be a number");
    if (b.at !== undefined && b.at !== null && typeof b.at !== "string") throw new BadInput("at must be an ISO date string");
    if (!id && phone) {
      const p = normalisePhone(phone);
      id = (await db.query("customers", { eq: { phone: p }, limit: 1 }))[0]?.id ?? null;
      if (!id) return json({ error: "No member with that phone" }, 404);
    }
    return json(await recordVisit({ customer_id: id!, service_id: serviceId, amount: b.amount, at: b.at }), 201);
  } catch (e) {
    return fail(e, e instanceof Error && /not found/i.test(e.message) ? 404 : e instanceof Error && /another till/.test(e.message) ? 409 : 400);
  }
}
