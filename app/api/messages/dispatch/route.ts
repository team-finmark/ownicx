import { json, requireCronSecret, safeRoute } from "@/lib/api";
import { dispatchQueued } from "@/lib/dispatch";

// Drains the automatic-WhatsApp sending queue. Call every few minutes (Supabase pg_cron, see schema.sql).
export const GET = safeRoute(async (req: Request) => {
  const denied = await requireCronSecret(req);
  if (denied) return denied;
  return json({ ok: true, ...(await dispatchQueued({ budgetMs: 8000 })) });
});
