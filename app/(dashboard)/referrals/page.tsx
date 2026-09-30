import { saveSettings } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, num, PageHeader, Person, Stat, pct } from "@/components/kit";
import * as db from "@/lib/db";

export default async function Referrals() {
  const [referrals, customers, settings] = await Promise.all([db.list("referrals"), db.list("customers"), db.getSettings()]);
  const visits = await db.queryIn("visits", "customer_id", referrals.filter((r) => r.level === 1).map((r) => r.referee_id));
  const cById = new Map(customers.map((c) => [c.id, c]));
  const l1 = referrals.filter((r) => r.level === 1);
  const rewarded = l1.filter((r) => r.status === "rewarded");
  const referredIds = new Set(l1.map((r) => r.referee_id));
  const referredRevenue = visits.filter((v) => referredIds.has(v.customer_id)).reduce((a, v) => a + v.amount, 0);
  const pointsPaid = referrals.reduce((a, r) => a + r.points_awarded, 0);

  const advocates = [...new Set(referrals.map((r) => r.referrer_id))]
    .map((id) => {
      const mine = referrals.filter((r) => r.referrer_id === id);
      const direct = mine.filter((r) => r.level === 1);
      const qualified = direct.filter((r) => r.status !== "pending").length;
      const nextMs = settings.referral_milestones.find((m) => m.count > qualified);
      return { c: cById.get(id)!, direct: direct.length, qualified, indirect: mine.filter((r) => r.level === 2).length, pts: mine.reduce((a, r) => a + r.points_awarded, 0), nextMs };
    })
    .filter((a) => a.c)
    .sort((a, b) => b.qualified - a.qualified || b.pts - a.pts);
  const star = advocates[0];
  const ms = settings.referral_milestones;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Rewards"
        title="Gamified referrals"
        sub="Two-level referral mechanics: members earn when a friend's first visit is paid, and again when that friend brings someone. Milestones turn advocates into an acquisition channel."
      />
      <div className="grid g-4">
        <Stat label="Referred members" value={num(l1.length)} delta={`${rewarded.length} qualified (first visit paid)`} />
        <Stat label="Conversion" value={pct((rewarded.length / Math.max(1, l1.length)) * 100, 0)} delta="referral → paid visit" />
        <Stat label="Revenue from referrals" value={`₹${num(referredRevenue)}`} />
        <Stat label="Points paid out" value={num(pointsPaid)} delta={`level 1 + level 2`} />
      </div>

      <div className="grid g-3 mt-16">
        <div className="ref-card">
          <div style={{ fontSize: 22, fontWeight: 650, lineHeight: 1.25 }}>Invite your friends<br />and earn rewards!</div>
          <p style={{ opacity: 0.85, fontSize: 13, marginTop: 8 }}>Share your code. You earn when your friend completes their first paid visit.</p>
          <div className="ref-code">{star?.c.referral_code ?? "SAM1074"}</div>
          <div className="btn" style={{ width: "100%", height: 44, border: 0, color: "var(--text)" }}>Copy your referral code</div>
          <p style={{ fontSize: 12.5, marginTop: 12, opacity: 0.85 }}>What members see in the app and on WhatsApp</p>
        </div>

        <Card title="How does it work?" sub={star ? `${star.c.name}'s progress` : undefined}>
          <div className="steps">
            {ms.map((m) => (
              <div key={m.count} className={`step${star && star.qualified >= m.count ? " done" : ""}`}>
                <span>{m.count} customer{m.count > 1 ? "s" : ""}</span>
                <span className="badge violet">★ {m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Mechanics">
          <ActionForm action={saveSettings} className="stack" style={{ gap: 12 }}>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="l1">Level 1 · per friend</label><input id="l1" name="referral_level1_points" type="number" className="input" defaultValue={settings.referral_level1_points} /></div>
              <div className="field"><label htmlFor="l2">Level 2 · friend-of-friend</label><input id="l2" name="referral_level2_points" type="number" className="input" defaultValue={settings.referral_level2_points} /></div>
            </div>
            <div className="lbl" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>Milestones (qualified friends → reward)</div>
            {[...ms, { count: 0, label: "", points: 0 }].map((m, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: "64px 1fr 80px", gap: 8 }}>
                <input name="milestone_count" type="number" className="input" defaultValue={m.count || ""} placeholder="#" aria-label="Friends" />
                <input name="milestone_label" className="input" defaultValue={m.label} placeholder="Reward label" aria-label="Label" />
                <input name="milestone_points" type="number" className="input" defaultValue={m.points || ""} placeholder="pts" aria-label="Points" />
              </div>
            ))}
            <Submit>Save mechanics</Submit>
          </ActionForm>
        </Card>
      </div>

      <Card title="Top advocates" className="mt-16" sub="Referrals are tracked per code, and qualify on the friend's first paid visit">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Advocate</th><th className="r">Friends referred</th><th className="r">Qualified</th><th className="r">Level-2 network</th><th className="r">Points earned</th><th>Next milestone</th></tr></thead>
            <tbody>
              {advocates.map((a) => (
                <tr key={a.c.id}>
                  <td><Person name={a.c.name} sub={a.c.referral_code} /></td>
                  <td className="r">{a.direct}</td>
                  <td className="r">{a.qualified}</td>
                  <td className="r">{a.indirect}</td>
                  <td className="r"><b>{num(a.pts)}</b></td>
                  <td>{a.nextMs ? <Badge tone="violet">{a.nextMs.count - a.qualified} more → {a.nextMs.label}</Badge> : <Badge tone="good">All unlocked</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
