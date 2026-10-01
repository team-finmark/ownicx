import Link from "next/link";
import { saveSettings } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, PageHeader, pct } from "@/components/kit";
import { churnSignals } from "@/lib/analytics";
import * as db from "@/lib/db";
import { DAY, formatDate } from "@/lib/engine";

export default async function Program() {
  const [customers, visits, services, coupons, referrals, tiers, messages, settings] = await Promise.all([
    db.list("customers"), db.query("visits", { gte: { at: new Date(Date.now() - 400 * 86_400_000).toISOString() } }), db.list("services"), db.query("coupons", { gte: { issued_at: new Date(Date.now() - 365 * 86_400_000).toISOString() } }), db.list("referrals"), db.list("tiers"), db.query("messages", { eq: { status: "sent" }, gte: { created_at: new Date(Date.now() - 90 * 86_400_000).toISOString() } }), db.getSettings(),
  ]);
  const now = Date.now();

  // KPI: rebooked within usual cycle + 15 days (haircut as the anchor service)
  const hc = visits.filter((v) => v.service_id === "haircut").sort((a, b) => a.at.localeCompare(b.at));
  const byC = new Map<string, number[]>();
  hc.forEach((v) => (byC.get(v.customer_id) ?? byC.set(v.customer_id, []).get(v.customer_id)!).push(new Date(v.at).getTime()));
  let pairs = 0, onTime = 0;
  byC.forEach((ts) => ts.slice(1).forEach((t, i) => { pairs++; if (t - ts[i] <= 75 * DAY) onTime++; }));
  const rebook = pairs ? (onTime / pairs) * 100 : 0;

  const issued = coupons.filter((c) => c.customer_id && c.source !== "manual");
  const redemption = issued.length ? (issued.filter((c) => c.status === "redeemed").length / issued.length) * 100 : 0;
  const viaRef = customers.length ? (customers.filter((c) => c.referred_by).length / customers.length) * 100 : 0;
  const upper = tiers.filter((t) => t.sort >= 2).map((t) => t.id);
  const goldPlus = customers.length ? (customers.filter((c) => upper.includes(c.tier_id)).length / customers.length) * 100 : 0;
  const days90 = new Set(visits.filter((v) => now - new Date(v.at).getTime() <= 90 * DAY).map((v) => `${v.customer_id}:${v.at.slice(0, 10)}`)).size;
  const perMember = days90 / Math.max(1, customers.length);
  const churn = churnSignals(customers, visits, services, now).length;
  const nextQbr = new Date(now);
  nextQbr.setMonth(Math.floor(nextQbr.getMonth() / 3) * 3 + 3, 5);

  const loops = [
    { loop: "Revisit", trigger: "Usual service cycle ends", action: "WhatsApp reminder + booking link", reward: "Points on every visit", kpi: "Rebooked on time", value: pct(rebook, 0), target: "70%", good: rebook >= 70 },
    { loop: "Milestone", trigger: "Balance crosses threshold", action: "Instant ₹-off offer", reward: "Discount on next service", kpi: "Visits per member / qtr", value: perMember.toFixed(1), target: "1.5", good: perMember >= 1.5 },
    { loop: "Urgency", trigger: "Offer nearing expiry", action: "7 / 3 / 1-day countdown", reward: "Keep the offer", kpi: "Offer redemption", value: pct(redemption, 0), target: "55%", good: redemption >= 55 },
    { loop: "Status", trigger: "Lifetime points climb", action: "Tier upgrade + multiplier", reward: "Perks & faster earning", kpi: "Members Gold+", value: pct(goldPlus, 0), target: "35%", good: goldPlus >= 35 },
    { loop: "Advocacy", trigger: "Friend's first paid visit", action: "Referral + milestone badges", reward: "Points, level-2 bonus", kpi: "New members via referral", value: pct(viaRef, 0), target: "20%", good: viaRef >= 20 },
    { loop: "Win-back", trigger: "Past cycle + 30 days", action: "Bonus points + invite", reward: "Bonus points", kpi: "Guests at churn risk", value: String(churn), target: "< 5", good: churn < 5 },
  ];

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Growth & control"
        title="Program design"
        sub="Each behavioural loop maps to one KPI, and the program is tuned to your margin goal instead of a generic template."
      />

      <Card title="Behavioural loops → KPIs" sub="Live values from your data; targets are set per salon at the design workshop">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Loop</th><th>Trigger</th><th>Action</th><th>Reward</th><th>KPI</th><th className="r">Now</th><th className="r">Target</th><th /></tr></thead>
            <tbody>
              {loops.map((l) => (
                <tr key={l.loop}>
                  <td style={{ fontWeight: 650 }}>{l.loop}</td>
                  <td className="text-2">{l.trigger}</td>
                  <td className="text-2">{l.action}</td>
                  <td className="text-2">{l.reward}</td>
                  <td>{l.kpi}</td>
                  <td className="r"><b>{l.value}</b></td>
                  <td className="r muted">{l.target}</td>
                  <td>{l.good ? <Badge tone="good">On track</Badge> : <Badge tone="warn">Tune</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-2 mt-16">
        <Card title="Economics & brand" sub="Guardrails every rule and campaign is measured against">
          <ActionForm action={saveSettings} className="stack" style={{ gap: 12 }}>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="p-n">Salon name</label><input id="p-n" name="salon_name" className="input" defaultValue={settings.salon_name} /></div>
              <div className="field"><span className="lbl">WhatsApp number</span><Link href="/settings/whatsapp" className="btn">{settings.whatsapp_number ? `+${settings.whatsapp_number} · change` : "Connect WhatsApp"}</Link></div>
            </div>
            <div className="field"><label htmlFor="p-b">Booking link</label><input id="p-b" name="booking_link" className="input" defaultValue={settings.booking_link} /></div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field">
                <label htmlFor="p-m">Gross margin goal %</label>
                <input id="p-m" name="margin_goal_pct" type="number" className="input" defaultValue={settings.margin_goal_pct} />
              </div>
              <div className="field">
                <label htmlFor="p-r">Max loyalty cost % of revenue</label>
                <input id="p-r" name="reward_budget_pct" type="number" step="0.5" className="input" defaultValue={settings.reward_budget_pct} />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Rule of thumb: an offer worth ₹X at Y points costs ₹X ÷ (spend needed to earn Y points). At {settings.reward_budget_pct}%, the program should give back no more than ₹{settings.reward_budget_pct} per ₹100 spent.
            </p>
            <Submit>Save guardrails</Submit>
          </ActionForm>
        </Card>

        <Card title="Your loyalty partner · Osiq Solutions" sub="Managed program, run continuously">
          <div className="list" style={{ fontSize: 13.5 }}>
            <div className="list-item"><span>Reviews member revenue and loyalty cost weekly</span><Badge tone="good">Active</Badge></div>
            <div className="list-item"><span>Tests offers with campaign control groups</span><Badge tone="good">Active</Badge></div>
            <div className="list-item"><span>Acts on churn signals ({churn} guests flagged now)</span><Badge tone={churn ? "warn" : "good"}>{churn ? "Action due" : "Clear"}</Badge></div>
            <div className="list-item"><span>{messages.filter((m) => m.status === "sent").length} WhatsApp touches delivered this cycle</span><Badge>Tracked</Badge></div>
          </div>
          <div className="callout info mt-16">
            <b style={{ color: "var(--text)" }}>Next QBR · {formatDate(nextQbr)}</b>
            <div style={{ marginTop: 6 }}>
              Agenda is ROI only: loyalty cost vs {settings.reward_budget_pct}% budget, margin vs {settings.margin_goal_pct}% goal, experiment winners to roll out, churn saved, referral CAC. No ticket-status review.
            </div>
          </div>
          <div className="muted mt-16" style={{ fontSize: 12 }}>{referrals.length} referral events · {coupons.length} coupons · {visits.length} visits on file</div>
        </Card>
      </div>
    </>
  );
}
