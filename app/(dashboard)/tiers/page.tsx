import { saveTier } from "@/app/actions";
import { StackBar } from "@/components/charts";
import { ActionForm, Submit } from "@/components/forms";
import { Card, DemoBanner, inr, num, PageHeader, Track } from "@/components/kit";
import * as db from "@/lib/db";

export default async function Tiers() {
  const [tiers, customers, services] = await Promise.all([db.list("tiers"), db.list("customers"), db.list("services")]);
  const sorted = [...tiers].sort((a, b) => a.sort - b.sort);
  const avgLifetime = Math.round(customers.reduce((a, c) => a + c.lifetime_points, 0) / Math.max(1, customers.length));
  const haircut = services.find((s) => s.id === "haircut") ?? services[0];

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Rewards"
        title="Tiers & rank progression"
        sub="Members climb on lifetime points, so redeeming never costs them their rank. Higher tiers earn faster through the multiplier."
      />

      <Card title="The ladder" sub="Lifetime points needed for each tier">
        <div style={{ padding: "8px 12px 0" }}>
          <Track value={avgLifetime} stops={sorted.map((t) => t.min_points)} />
          <div className="muted" style={{ fontSize: 12 }}>Knob = average member ({num(avgLifetime)} lifetime pts)</div>
        </div>
        <div className="mt-16">
          <StackBar parts={sorted.map((t) => ({ label: t.name, value: customers.filter((c) => c.tier_id === t.id).length, color: t.color }))} />
        </div>
      </Card>

      <div className="grid g-2 mt-16">
        {sorted.map((t) => {
          const members = customers.filter((c) => c.tier_id === t.id);
          const avgSpend = members.length ? members.reduce((a, c) => a + c.total_spend, 0) / members.length : 0;
          return (
            <Card key={t.id} title={<span className="row"><span className="dot" style={{ color: t.color, width: 12, height: 12 }} />{t.name}</span>} sub={`${members.length} members · avg spend ${inr(avgSpend)}`}>
              <ActionForm action={saveTier} className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="id" value={t.id} />
                <div className="grid g-3" style={{ gap: 10 }}>
                  <div className="field"><label htmlFor={`${t.id}-n`}>Name</label><input id={`${t.id}-n`} name="name" className="input" defaultValue={t.name} /></div>
                  <div className="field"><label htmlFor={`${t.id}-m`}>From (lifetime pts)</label><input id={`${t.id}-m`} name="min_points" type="number" min={0} className="input" defaultValue={t.min_points} /></div>
                  <div className="field"><label htmlFor={`${t.id}-x`}>Points multiplier</label><input id={`${t.id}-x`} name="multiplier" type="number" step="0.05" min={1} className="input" defaultValue={t.multiplier} /></div>
                </div>
                <div className="field">
                  <label htmlFor={`${t.id}-p`}>Perks (one per line)</label>
                  <textarea id={`${t.id}-p`} name="perks" className="textarea" rows={3} defaultValue={t.perks.join("\n")} />
                </div>
                <div className="row between">
                  <span className="muted" style={{ fontSize: 12.5 }}>A {haircut.name.toLowerCase()} earns <b className="num" style={{ color: "var(--text)" }}>{num(Math.round(haircut.points * t.multiplier))} pts</b> here</span>
                  <Submit>Save tier</Submit>
                </div>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
