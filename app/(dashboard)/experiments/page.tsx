import { concludeExperiment, createExperiment, launchExperiment } from "@/app/actions";
import { BarChart } from "@/components/charts";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Badge, Card, compactInr, DemoBanner, inr, PageHeader, Stat, pct } from "@/components/kit";
import { campaignStats, lastMonths, monthly } from "@/lib/analytics";
import * as db from "@/lib/db";
import { DAY } from "@/lib/engine";
import type { ExperimentVariant, Message } from "@/lib/types";

// Two-proportion z-test → confidence that B differs from A.
function significance(a: ExperimentVariant, b: ExperimentVariant) {
  if (!a.users || !b.users) return 0;
  const p1 = a.conversions / a.users;
  const p2 = b.conversions / b.users;
  const p = (a.conversions + b.conversions) / (a.users + b.users);
  const se = Math.sqrt(p * (1 - p) * (1 / a.users + 1 / b.users));
  if (!se) return 0;
  const z = Math.abs((p2 - p1) / se);
  // Normal CDF approximation (Abramowitz–Stegun)
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (1 - 2 * tail) * 100;
}

export default async function Experiments() {
  const [experiments, visits, coupons, campaigns, settings, messages, customers, tiers] = await Promise.all([
    db.list("experiments"),
    db.query("visits", { gte: { at: new Date(Date.now() - 200 * 86_400_000).toISOString() } }),
    db.query("coupons", { eq: { status: "redeemed" }, gte: { redeemed_at: new Date(Date.now() - 200 * 86_400_000).toISOString() } }),
    db.list("campaigns"),
    db.getSettings(),
    Promise.resolve([] as Message[]),
    db.list("customers"),
    db.list("tiers"),
  ]);
  const cmpById = new Map(campaigns.map((c) => [c.id, c]));
  const expCampaigns = experiments.flatMap((e) => e.variants.map((v) => v.campaign_id).filter(Boolean) as string[]);
  messages.push(...(await db.queryIn("messages", "campaign_id", expCampaigns)));
  // Variants that ran as real campaigns are measured; older ones keep their recorded numbers.
  const measured = (v: ExperimentVariant): ExperimentVariant => {
    const c = v.campaign_id ? cmpById.get(v.campaign_id) : undefined;
    if (!c) return v;
    const r = campaignStats(c, messages, visits);
    return { ...v, users: r.tracked ? r.sent : v.users, conversions: r.tracked ? r.converted : 0, revenue: r.tracked ? r.revenue : 0 };
  };
  const segs = [...new Set(customers.flatMap((c) => c.segment))].sort();
  const optedIn = customers.filter((c) => c.whatsapp_opt_in);
  const audiences = [
    { value: "all", label: `Everyone (${optedIn.length})` },
    ...segs.map((sg) => ({ value: sg, label: `${sg.replace("_", " ")} (${optedIn.filter((c) => c.segment.includes(sg)).length})` })),
    ...tiers.map((t) => ({ value: `tier:${t.id}`, label: `${t.name} tier (${optedIn.filter((c) => c.tier_id === t.id).length})` })),
  ];
  const months = lastMonths(6);
  const revenue = monthly(visits, (v) => v.at, (v) => v.amount, months);
  const rewardCost = monthly(coupons.filter((c) => c.status === "redeemed"), (c) => c.redeemed_at, (c) => c.value, months);
  const campaignCost = monthly(campaigns, (c) => c.starts_at, (c) => c.cost, months);
  const cost = rewardCost.map((v, i) => v + campaignCost[i]);

  const now = Date.now();
  const rev90 = visits.filter((v) => now - new Date(v.at).getTime() <= 90 * DAY).reduce((a, v) => a + v.amount, 0);
  const cost90 = cost.slice(-3).reduce((a, b) => a + b, 0);
  const costPct = rev90 ? (cost90 / rev90) * 100 : 0;
  // Assumes ~40% service cost (stylist commission + product) before loyalty cost.
  const SERVICE_COST_PCT = 40;
  const margin = 100 - SERVICE_COST_PCT - costPct;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Growth & control"
        title="P&L and A/B experiments"
        sub="Loyalty economics against your margin goal, plus controlled tests on timing, offers and messaging. Decisions are based on ROI, not on how busy the program looks."
      />
      <div className="grid g-4">
        <Stat label="Member revenue · 90 days" value={compactInr(rev90)} />
        <Stat label="Loyalty cost · 90 days" value={compactInr(cost90)} delta={`${pct(costPct)} of revenue · budget ${settings.reward_budget_pct}%`} tone={costPct <= settings.reward_budget_pct ? "up" : "down"} />
        <Stat label="Est. gross margin" value={pct(margin, 0)} delta={`goal ${settings.margin_goal_pct}%`} tone={margin >= settings.margin_goal_pct ? "up" : "down"} />
        <Stat label="Running tests" value={experiments.filter((e) => e.status === "running").length} />
      </div>

      <div className="grid g-2 mt-16">
        <Card title="Revenue" sub="Member service revenue by month">
          <BarChart labels={months.map((m) => m.label)} series={[{ name: "Revenue", color: "var(--s1)", values: revenue }]} format="inr" />
        </Card>
        <Card title="Loyalty cost" sub="Redeemed rewards + campaign cost by month">
          <BarChart labels={months.map((m) => m.label)} series={[{ name: "Reward cost", color: "var(--s2)", values: rewardCost }, { name: "Campaign cost", color: "var(--s3)", values: campaignCost }]} format="inr" />
        </Card>
      </div>

      <h2 className="section-title">Experiments</h2>
      <div className="grid g-2">
        {experiments.map((raw) => {
          const e = { ...raw, variants: raw.variants.map(measured) };
          const [a, b] = e.variants;
          const conf = a && b ? significance(a, b) : 0;
          const winner = a && b ? (b.conversions / Math.max(1, b.users) > a.conversions / Math.max(1, a.users) ? b : a) : null;
          const lift = a && b && a.conversions ? ((b.conversions / b.users - a.conversions / a.users) / (a.conversions / a.users)) * 100 : 0;
          return (
            <Card key={e.id} title={<>{e.name} {!raw.variants.some((v) => v.campaign_id) && <Badge>example data</Badge>}</>} sub={e.hypothesis} action={<Badge tone={e.status === "running" ? "accent" : e.status === "draft" ? undefined : "good"}>{e.status === "draft" ? "not launched" : e.status}</Badge>}>
              <div className="stack" style={{ gap: 12 }}>
                {e.variants.map((v) => {
                  const cr = v.users ? (v.conversions / v.users) * 100 : 0;
                  return (
                    <div key={v.name}>
                      <div className="row between" style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{v.name}</span>
                        <span className="num text-2">{v.conversions}/{v.users} · <b style={{ color: "var(--text)" }}>{pct(cr)}</b> · {inr(v.revenue)}</span>
                      </div>
                      <div className="bar mt-8"><i style={{ width: `${Math.min(100, cr * 2)}%`, background: v === winner ? "var(--s1)" : "var(--border-strong)" }} /></div>
                    </div>
                  );
                })}
                <div className="divider" style={{ margin: "4px 0" }} />
                <div className="row between wrap" style={{ fontSize: 13 }}>
                  <span className="text-2">Metric: {e.metric}</span>
                  <span>
                    B vs A: <b className={lift >= 0 ? "" : ""} style={{ color: lift >= 0 ? "var(--good)" : "var(--bad)" }}>{lift >= 0 ? "+" : ""}{lift.toFixed(1)}%</b> ·{" "}
                    <Badge tone={conf >= 95 ? "good" : "warn"}>{conf.toFixed(0)}% confidence</Badge>
                  </span>
                </div>
                {e.status === "draft" && (
                  <div className="row">
                    <ActionButton className="btn sm primary" action={launchExperiment.bind(null, e.id)} confirm={`Launch “${e.name}”? Each half of the audience gets its own offer on WhatsApp.`}>Launch test</ActionButton>
                    <span className="muted" style={{ fontSize: 12 }}>{a?.users ?? 0} vs {b?.users ?? 0} members, split at random</span>
                  </div>
                )}
                {e.status === "running" && (
                  <div className="row">
                    <ActionButton action={concludeExperiment.bind(null, e.id)}>Conclude &amp; keep winner</ActionButton>
                    {conf < 95 && <span className="muted" style={{ fontSize: 12 }}>Needs more data for 95% confidence</span>}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        <Card title="New experiment">
          <ActionForm action={createExperiment} resetOnSuccess className="stack" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="ex-n">Name</label><input id="ex-n" name="name" className="input" required placeholder="₹150 off vs 25 bonus points" /></div>
            <div className="field">
              <label htmlFor="ex-s">Audience</label>
              <select id="ex-s" name="segment" className="select">{audiences.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <span className="hint">Split 50/50 at random. Only members who agreed to WhatsApp are included.</span>
            </div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="ex-a">Offer A</label><input id="ex-a" name="offer_a" className="input" required placeholder="₹150 off any service" /></div>
              <div className="field"><label htmlFor="ex-b">Offer B</label><input id="ex-b" name="offer_b" className="input" required placeholder="25 bonus points on your next visit" /></div>
            </div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="ex-h">Hypothesis <span className="muted">(optional)</span></label><input id="ex-h" name="hypothesis" className="input" placeholder="Cash-off converts better" /></div>
              <div className="field"><label htmlFor="ex-d">Runs for (days)</label><input id="ex-d" name="days" type="number" min={3} max={60} className="input" defaultValue={14} /></div>
            </div>
            <span className="hint">Success = a member books a visit before the test ends. Revenue is what they spend.</span>
            <Submit>Create test</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
