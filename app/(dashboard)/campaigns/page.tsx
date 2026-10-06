import { launchCampaign } from "@/app/actions";
import { CampaignForm } from "@/components/CampaignForm";
import { ActionButton } from "@/components/forms";
import { Badge, Card, compactInr, DemoBanner, num, PageHeader, pct } from "@/components/kit";
import { campaignStats } from "@/lib/analytics";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";

const SEG_HELP: Record<string, string> = {
  women: "Women members",
  men: "Men members",
  high_value: "Frequent, multi-service guests",
  vip: "₹30k+ lifetime spend",
  lapsed: "No visit in 120+ days",
  new: "Joined recently",
};

export default async function Campaigns() {
  const [campaigns, customers, tiers] = await Promise.all([db.list("campaigns"), db.list("customers"), db.list("tiers")]);
  const since = campaigns.reduce((m, c) => (c.starts_at < m ? c.starts_at : m), new Date().toISOString());
  const [messages, visits] = await Promise.all([db.queryIn("messages", "campaign_id", campaigns.map((c) => c.id)), db.query("visits", { gte: { at: since } })]);
  const now = Date.now();
  const segs = [...new Set(customers.flatMap((c) => c.segment))].sort();
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));
  const pickable = [...customers]
    .sort((a, b) => Number(b.whatsapp_opt_in) - Number(a.whatsapp_opt_in) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, tier: tierName.get(c.tier_id) ?? "", optIn: c.whatsapp_opt_in }));
  const audience = [
    { value: "all", label: "Everyone", n: customers.filter((c) => c.whatsapp_opt_in).length },
    ...segs.map((s) => ({ value: s, label: SEG_HELP[s] ?? s, n: customers.filter((c) => c.whatsapp_opt_in && c.segment.includes(s)).length })),
    ...tiers.map((t) => ({ value: `tier:${t.id}`, label: `${t.name} tier`, n: customers.filter((c) => c.whatsapp_opt_in && c.tier_id === t.id).length })),
  ];

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Program"
        title="Engagements"
        sub="Personalised campaigns for each audience in the program. Marketers launch them with no code, and every send goes through the same consent-aware Outbox."
      />

      <h2 className="section-title" style={{ marginTop: 0 }}>Audiences</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {audience.map((a) => (
          <div key={a.value} className="pill-stat">
            <span className="v">{num(a.n)}</span>
            <span className="l">{a.label}</span>
          </div>
        ))}
      </div>

      <div className="grid g-main mt-24">
        <Card title="Campaigns" sub="Booked = messaged members who visited before the campaign ended. Lift compares them with a no-message control group, so it shows what the campaign actually caused.">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Campaign</th><th>Audience</th><th>Window</th><th className="r">Sent</th><th className="r">Booked</th><th className="r">Revenue</th><th className="r">ROI</th><th className="r">Lift</th><th /></tr></thead>
              <tbody>
                {[...campaigns].reverse().map((c) => {
                  const r = campaignStats(c, messages, visits, now);
                  return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name} {!r.tracked && r.sent > 0 && <Badge>example data</Badge>}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.offer}</div>
                    </td>
                    <td><Badge>{c.segment === "members" ? `${c.member_ids?.length ?? 0} picked member${(c.member_ids?.length ?? 0) === 1 ? "" : "s"}` : c.segment.replace("tier:", "tier · ")}</Badge></td>
                    <td className="text-2" style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{formatDate(c.starts_at, { day: "numeric", month: "short" })} – {formatDate(c.ends_at, { day: "numeric", month: "short" })}</td>
                    <td className="r">{num(r.sent)}</td>
                    <td className="r">{num(r.converted)} <span className="muted">{r.sent ? pct((r.converted / r.sent) * 100, 0) : ""}</span></td>
                    <td className="r">{compactInr(r.revenue)}</td>
                    <td className="r">{r.cost ? `${(r.revenue / r.cost).toFixed(1)}×` : "—"}</td>
                    <td className="r" title={r.control ? `Control: ${r.control.converted}/${r.control.size} booked without a message` : "No control group"}>
                      {r.liftPts === undefined ? <span className="muted">—</span> : (
                        <>
                          <b style={{ color: r.liftPts >= 0 ? "var(--good)" : "var(--bad)" }}>{r.liftPts >= 0 ? "+" : ""}{r.liftPts.toFixed(1)} pts</b>
                          <div className="muted" style={{ fontSize: 12 }}>{compactInr(Math.max(0, r.incrementalRevenue ?? 0))} extra</div>
                        </>
                      )}
                    </td>
                    <td>
                      {(r.status === "draft" || r.status === "scheduled") && Date.parse(c.ends_at) > now ? (
                        <ActionButton className="btn sm primary" action={launchCampaign.bind(null, c.id)} confirm={`Launch “${c.name}”? One WhatsApp message goes to each opted-in member in this audience.`}>Launch</ActionButton>
                      ) : (
                        <Badge tone={r.status === "live" ? "good" : undefined}>{r.status === "draft" || r.status === "scheduled" ? "expired draft" : r.status}</Badge>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="New engagement" sub="Launching sends one WhatsApp message per opted-in member">
          <CampaignForm audience={audience} members={pickable} />
        </Card>
      </div>
    </>
  );
}
