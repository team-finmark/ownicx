import { json, requireCronSecret } from "@/lib/api";
import { runAutomations } from "@/lib/runner";

// Call hourly (Supabase pg_cron, Vercel Cron, or any free scheduler).
// Each rule only fires during its own send hour; add ?force=1 to evaluate every rule now.
export async function GET(req: Request) {
  const denied = await requireCronSecret(req);
  if (denied) return denied;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await runAutomations({ respectSendHour: !force });
  return json({ ok: true, ...result });
}
