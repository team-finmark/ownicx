import { json, requireCronSecret } from "@/lib/api";
import { dispatchQueued } from "@/lib/dispatch";

// Drains the automatic-WhatsApp sending queue. Call every few minutes (Supabase pg_cron, see schema.sql).
export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  return json({ ok: true, ...(await dispatchQueued({ budgetMs: 8000 })) });
}
