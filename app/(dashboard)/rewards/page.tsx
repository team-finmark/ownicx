import Link from "next/link";
import { createReward, generateCoupons, redeemCoupon, toggleReward } from "@/app/actions";
import { ActionForm, LiveSwitch, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Stat } from "@/components/kit";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";

export default async function Rewards({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "active" } = await searchParams;
  const now = Date.now();
  const yearAgo = new Date(now - 365 * 86_400_000).toISOString();
  const tab = ["active", "redeemed", "expired"].includes(status) ? status : "active";
  // Counts come from the database; only the open tab (newest 150) and the last year's redemptions are loaded.
  const [rewards, tiers, activeCount, redeemedCount, expiredCount, issuedYear, redeemedYear, list, active] = await Promise.all([
    db.list("rewards"),
    db.list("tiers"),
    db.count("coupons", { eq: { status: "active" } }),
    db.count("coupons", { eq: { status: "redeemed" } }),
    db.count("coupons", { eq: { status: "expired" } }),
    db.count("coupons", { gte: { issued_at: yearAgo }, not: { customer_id: null } }),
    db.query("coupons", { eq: { status: "redeemed" }, gte: { redeemed_at: yearAgo } }),
    db.query("coupons", { eq: { status: tab }, order: { column: "issued_at", ascending: false }, limit: 150 }),
    db.query("coupons", { eq: { status: "active" }, order: { column: "issued_at", ascending: false }, limit: 20 }),
  ]);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const customers = await db.queryIn("customers", "id", [...list, ...active].map((c) => c.customer_id).filter(Boolean) as string[]);
  const cById = new Map(customers.map((c) => [c.id, c]));
  const redemptionRate = issuedYear ? (redeemedYear.filter((c) => c.customer_id).length / issuedYear) * 100 : 0;
  const featured = active.find((c) => c.customer_id) ?? active[0];

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader eyebrow="Rewards" title="Rewards & coupons" sub="The catalogue members redeem points against, plus coupon codes for campaigns, partners and the counter." />

      <div className="grid g-4">
        <Stat label="Live coupons" value={num(activeCount)} />
        <Stat label="Redeemed" value={num(redeemedCount)} delta={`${inr(redeemedYear.reduce((a, c) => a + c.value, 0))} in benefits this year`} />
        <Stat label="Redemption rate" value={`${redemptionRate.toFixed(0)}%`} delta="of member coupons issued in the last year" />
        <Stat label="Expired unused" value={num(expiredCount)} delta="urgency nudges cut this" />
      </div>

      <h2 className="section-title">Catalogue</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {rewards.map((r) => {
          const t = r.tier_id ? tierById.get(r.tier_id) : null;
          return (
            <div className="reward-tile" key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
              <div className={`reward-art${t && t.sort > 1 ? " locked" : ""}`}>
                <span style={{ position: "relative", zIndex: 0 }}>{r.emoji}</span>
                {t && t.sort > 1 && <span className="lock" aria-label={`Unlocks at ${t.name}`}>🔒</span>}
              </div>
              <div className="reward-body">
                <span className="muted" style={{ fontSize: 12 }}>{t ? `${t.name} tier` : "All tiers"}</span>
                <span style={{ fontWeight: 650 }}>{r.name}</span>
                <div className="row between" style={{ marginTop: "auto", paddingTop: 8 }}>
                  <span style={{ fontFamily: "var(--font-rounded)", fontWeight: 700, fontSize: 20 }}>{num(r.cost_points)} <span style={{ fontSize: 13, color: "var(--text-3)" }}>pts</span></span>
                  <LiveSwitch checked={r.active} label={`${r.name} active`} onToggle={toggleReward.bind(null, r.id)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid g-3 mt-24">
        <Card title="Add reward">
          <ActionForm action={createReward} resetOnSuccess className="stack" style={{ gap: 12 }}>
            <div className="grid" style={{ gridTemplateColumns: "64px 1fr", gap: 10 }}>
              <div className="field"><label htmlFor="rw-e">Icon</label><input id="rw-e" name="emoji" className="input" defaultValue="🎁" /></div>
              <div className="field"><label htmlFor="rw-n">Name</label><input id="rw-n" name="name" className="input" required placeholder="Free head massage" /></div>
            </div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field">
                <label htmlFor="rw-k">Type</label>
                <select id="rw-k" name="kind" className="select">
                  <option value="flat_off">₹ off</option><option value="percent_off">% off</option><option value="free_service">Free service</option><option value="gift">Gift</option>
                </select>
              </div>
              <div className="field"><label htmlFor="rw-v">Value (₹ or %)</label><input id="rw-v" name="value" type="number" className="input" required /></div>
              <div className="field"><label htmlFor="rw-c">Cost (points)</label><input id="rw-c" name="cost_points" type="number" className="input" required defaultValue={100} /></div>
              <div className="field"><label htmlFor="rw-d">Valid (days)</label><input id="rw-d" name="validity_days" type="number" className="input" defaultValue={30} /></div>
            </div>
            <div className="field">
              <label htmlFor="rw-t">Unlocks at</label>
              <select id="rw-t" name="tier_id" className="select"><option value="">All tiers</option>{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </div>
            <Submit>Add to catalogue</Submit>
          </ActionForm>
        </Card>

        <Card id="redeem" title="Generate coupon codes" sub="For flyers, partners, influencers or events">
          <ActionForm action={generateCoupons} className="stack" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="gc-l">Label</label><input id="gc-l" name="label" className="input" placeholder="₹200 off first visit" /></div>
            <div className="grid g-3" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="gc-p">Prefix</label><input id="gc-p" name="prefix" className="input" defaultValue="LUXE" /></div>
              <div className="field"><label htmlFor="gc-v">₹ value</label><input id="gc-v" name="value" type="number" className="input" defaultValue={200} /></div>
              <div className="field"><label htmlFor="gc-q">Qty</label><input id="gc-q" name="qty" type="number" min={1} max={500} className="input" defaultValue={25} /></div>
            </div>
            <div className="field"><label htmlFor="gc-d">Valid for (days)</label><input id="gc-d" name="validity_days" type="number" className="input" defaultValue={30} /></div>
            <Submit>Generate</Submit>
          </ActionForm>
          <div className="divider" />
          <ActionForm action={redeemCoupon} resetOnSuccess className="row wrap">
            <input name="code" className="input mono" placeholder="Redeem at counter: CODE" required aria-label="Coupon code" style={{ textTransform: "uppercase", flex: "2 1 160px" }} />
            <input name="bill" type="number" min={0} className="input" placeholder="Bill ₹ (for % off)" aria-label="Bill amount, needed for percentage coupons" style={{ flex: "1 1 120px" }} />
            <Submit className="btn accent">Redeem</Submit>
          </ActionForm>
        </Card>

        {featured && (
          <div className="ticket" aria-label="Coupon preview as the guest sees it">
            <div className="ticket-top">🎟️</div>
            <div className="ticket-body">
              <div style={{ fontWeight: 650, fontSize: 17 }}>{featured.label}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {featured.customer_id ? `For ${cById.get(featured.customer_id)?.name ?? "member"} · ` : ""}Expires on {formatDate(featured.expires_at)}
              </div>
              <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 14, padding: 14, marginTop: 14, textAlign: "center" }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Scan the barcode or show the code at the counter</div>
                <div className="barcode" />
                <div className="row between" style={{ background: "rgba(255,255,255,.08)", borderRadius: 10, padding: "8px 10px", marginTop: 12 }}>
                  <span className="mono" style={{ letterSpacing: ".08em" }}>{featured.code}</span>
                  <span className="badge" style={{ background: "#fff", color: "#151c2c" }}>{featured.source}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row between mt-24" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Coupons</h2>
        <div className="tabs">
          {["active", "redeemed", "expired"].map((s) => (
            <Link key={s} href={`/rewards?status=${s}`} className={status === s ? "on" : ""}>{s[0].toUpperCase() + s.slice(1)}</Link>
          ))}
        </div>
      </div>
      <Card>
        {list.length === 0 ? (
          <div className="empty">No {status} coupons.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Offer</th><th>Member</th><th>Source</th><th className="r">Value</th><th>Expires</th></tr></thead>
              <tbody>
                {list.slice(0, 150).map((c) => {
                  const left = Math.ceil((new Date(c.expires_at).getTime() - now) / 86_400_000);
                  return (
                    <tr key={c.id}>
                      <td className="mono">{c.code}</td>
                      <td>{c.label}</td>
                      <td>{c.customer_id ? cById.get(c.customer_id)?.name : <span className="muted">Unassigned</span>}</td>
                      <td><Badge>{c.source}</Badge></td>
                      <td className="r">{inr(c.value)}</td>
                      <td>
                        {formatDate(c.expires_at)}{" "}
                        {c.status === "active" && left <= 3 && <Badge tone="bad">{left <= 0 ? "today" : `${left}d left`}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
