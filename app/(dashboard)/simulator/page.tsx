import { WhatsAppSimulator, type SimMember, type SimPreset, type SimRule } from "@/components/WhatsAppSimulator";
import { DemoBanner, PageHeader } from "@/components/kit";
import * as db from "@/lib/db";
import { DAY } from "@/lib/engine";
import { getConnection } from "@/lib/whatsapp";

// Shows, step by step, how one personalised WhatsApp message is built and delivered — using a real
// member and a real rule. Pure simulation: nothing is queued or sent.
export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message: messageId } = await searchParams;
  const [settings, conn, rules, services, tiers, members] = await Promise.all([
    db.getSettings(),
    getConnection(),
    db.list("automation_rules"),
    db.list("services"),
    db.list("tiers"),
    db.query("customers", { order: { column: "name" }, limit: 300 }),
  ]);
  // Opened from the Outbox: play that exact queued message for its member.
  const queued = messageId && /^[\w-]{1,64}$/.test(messageId) ? await db.get("messages", messageId) : null;
  if (queued && !members.some((m) => m.id === queued.customer_id)) {
    const extra = await db.get("customers", queued.customer_id);
    if (extra) members.unshift(extra);
  }
  const queuedCampaign = queued?.campaign_id ? await db.get("campaigns", queued.campaign_id) : null;
  const preset: SimPreset | null = queued
    ? { memberId: queued.customer_id, ruleId: queued.rule_id ?? "campaign", text: queued.body, offer: queuedCampaign?.offer ?? null, source: queuedCampaign ? `campaign “${queuedCampaign.name}”` : (rules.find((r) => r.id === queued.rule_id)?.name ?? "Outbox") }
    : null;
  const now = Date.now();
  const visits = await db.queryIn("visits", "customer_id", members.map((m) => m.id), { gte: { at: new Date(now - 400 * DAY).toISOString() } });
  const lastBy = new Map<string, { at: string; service_id: string }>();
  for (const v of visits) {
    const cur = lastBy.get(v.customer_id);
    if (!cur || Date.parse(v.at) > Date.parse(cur.at)) lastBy.set(v.customer_id, v);
  }
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));

  const simMembers: SimMember[] = members
    .sort((a, b) => Number(b.whatsapp_opt_in) - Number(a.whatsapp_opt_in))
    .map((m) => {
      const last = lastBy.get(m.id);
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        points: m.points,
        tier: tierName.get(m.tier_id) ?? "",
        optIn: m.whatsapp_opt_in,
        lastService: last ? serviceName.get(last.service_id) ?? "visit" : null,
        daysSince: last ? Math.floor((now - Date.parse(last.at)) / DAY) : null,
      };
    });
  const simRules: SimRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: r.enabled,
    template: r.template,
    config: r.config as unknown as Record<string, unknown>,
    serviceName: (r.config as { service_id?: string }).service_id ? serviceName.get((r.config as { service_id: string }).service_id) ?? null : null,
  }));

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="WhatsApp AI"
        title="Message simulator"
        sub="See exactly how a personalised WhatsApp message is built, checked and delivered — with a real member and a real rule. Nothing is actually sent."
      />
      <WhatsAppSimulator
        members={simMembers}
        rules={simRules}
        salon={settings.salon_name}
        bookingLink={settings.booking_link}
        preset={preset}
        connection={{
          automatic: conn.mode === "cloud_api" && conn.status === "connected",
          phone: conn.display_phone ?? (conn.phone ? `+${conn.phone}` : null),
          name: conn.verified_name ?? settings.salon_name,
        }}
      />
    </>
  );
}
