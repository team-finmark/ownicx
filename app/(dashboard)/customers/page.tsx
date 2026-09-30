import Link from "next/link";
import { recordVisitAction, redeemRewardAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { MemberActions, type MemberCoupon } from "@/components/MemberActions";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Person, TierBadge } from "@/components/kit";
import * as db from "@/lib/db";
import { DAY, daysSince, formatDate, nextTier } from "@/lib/engine";

export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string; tier?: string; seg?: string }> }) {
  const { q = "", tier = "", seg = "" } = await searchParams;
  const [customers, tiers, services, rewards, coupons] = await Promise.all([db.list("customers"), db.list("tiers"), db.list("services"), db.list("rewards"), db.query("coupons", { gte: { issued_at: new Date(Date.now() - 365 * 86_400_000).toISOString() } })]);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const segments = [...new Set(customers.flatMap((c) => c.segment))].sort();
  const needle = q.toLowerCase();
  const rows = customers
    .filter((c) => (!needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle) || c.referral_code.toLowerCase().includes(needle)) && (!tier || c.tier_id === tier) && (!seg || c.segment.includes(seg)))
    .sort((a, b) => (b.last_visit_at ?? "").localeCompare(a.last_visit_at ?? ""));
  const now = Date.now();
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  // Coupons per member, newest first, with expiry in India time.
  const couponsBy = new Map<string, MemberCoupon[]>();
  for (const cp of [...coupons].sort((a, b) => b.issued_at.localeCompare(a.issued_at))) {
    if (!cp.customer_id) continue;
    const expired = cp.status === "expired" || (cp.status === "active" && new Date(cp.expires_at).getTime() < now);
    const list = couponsBy.get(cp.customer_id) ?? [];
    list.push({
      id: cp.id,
      code: cp.code,
      label: cp.label,
      status: cp.status === "redeemed" ? "redeemed" : expired ? "expired" : "active",
      expiresOn: ymd.format(new Date(cp.expires_at)),
      expiresText: formatDate(cp.expires_at, { day: "numeric", month: "short" }),
      daysLeft: Math.ceil((new Date(cp.expires_at).getTime() - now) / DAY),
    });
    couponsBy.set(cp.customer_id, list);
  }

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Program"
        title="Members"
        sub={`${num(customers.length)} members · points, tiers and visit history in one place.`}
        actions={<Link className="btn primary" href="/onboarding">Onboard member</Link>}
      />

      <div className="stack" style={{ marginBottom: 20 }}>
        <Card id="record" title="Record a visit" sub="Awards points, updates tier, and fires milestone offers instantly">
          <ActionForm action={recordVisitAction} className="grid form-row" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}>
            <div className="field">
              <label htmlFor="rv-c">Member</label>
              <select id="rv-c" name="customer_id" className="select" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {sorted.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.points} pts</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rv-s">Service</label>
              <select id="rv-s" name="service_id" className="select" required>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name} (+{s.points})</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rv-a">Bill ₹</label>
              <input id="rv-a" name="amount" type="number" min={0} className="input" placeholder="auto" />
            </div>
            <Submit>Add</Submit>
          </ActionForm>
        </Card>
        <Card title="Redeem points for a reward" sub="Deducts points and issues a coupon code. Leave “Valid for” empty to use the reward’s usual expiry.">
          <ActionForm action={redeemRewardAction} className="grid form-row" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2.5fr) minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}>
            <div className="field">
              <label htmlFor="rr-c">Member</label>
              <select id="rr-c" name="customer_id" className="select" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {sorted.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.points} pts</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rr-r">Reward</label>
              <select id="rr-r" name="reward_id" className="select" required>
                {rewards.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.name} · {r.cost_points} pts · {r.validity_days}d</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rr-d">Valid for (days)</label>
              <input id="rr-d" name="validity_days" type="number" min={1} max={365} className="input" placeholder="Reward default" />
            </div>
            <Submit>Redeem</Submit>
          </ActionForm>
        </Card>
      </div>

      <Card>
        <form className="row wrap" style={{ marginBottom: 16 }}>
          <input name="q" defaultValue={q} className="input" placeholder="Search name, phone or referral code" style={{ maxWidth: 320 }} aria-label="Search" />
          <select name="tier" defaultValue={tier} className="select" style={{ width: 150 }} aria-label="Tier">
            <option value="">All tiers</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select name="seg" defaultValue={seg} className="select" style={{ width: 170 }} aria-label="Segment">
            <option value="">All segments</option>
            {segments.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <button className="btn">Filter</button>
          <span className="muted" style={{ marginLeft: "auto" }}>{rows.length} shown</span>
        </form>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th><th>Tier</th><th className="r">Points</th><th>Next tier</th><th className="r">Visits</th><th className="r">Spend</th><th>Last visit</th><th>Live offers</th><th>KYC</th><th>WhatsApp</th><th className="sticky-end" style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const t = tierById.get(c.tier_id)!;
                const nt = nextTier(t, tiers);
                const prog = nt ? Math.min(100, ((c.lifetime_points - t.min_points) / (nt.min_points - t.min_points)) * 100) : 100;
                const mine = couponsBy.get(c.id) ?? [];
                const live = mine.filter((cp) => cp.status === "active");
                return (
                  <tr key={c.id}>
                    <td><Person name={c.name} sub={`+${c.phone} · ${c.referral_code}`} /></td>
                    <td><TierBadge name={t.name} color={t.color} /></td>
                    <td className="r"><b>{num(c.points)}</b></td>
                    <td style={{ minWidth: 130 }}>
                      <div className="bar"><i style={{ width: `${prog}%` }} /></div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{nt ? `${num(nt.min_points - c.lifetime_points)} to ${nt.name}` : "Top tier"}</div>
                    </td>
                    <td className="r">{c.visit_count}</td>
                    <td className="r">{inr(c.total_spend)}</td>
                    <td className="text-2 num">{c.last_visit_at ? `${daysSince(c.last_visit_at, now)}d ago` : "—"}</td>
                    <td style={{ minWidth: 170 }}>
                      {live.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        live.slice(0, 2).map((cp) => (
                          <div key={cp.id} style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 4 }}>
                            <span className="mono" style={{ fontWeight: 600 }}>{cp.code}</span>
                            <div style={{ color: cp.daysLeft <= 3 ? "var(--bad)" : "var(--text-3)" }}>
                              expires {cp.expiresText} · {cp.daysLeft <= 0 ? "today" : `${cp.daysLeft}d`}
                            </div>
                          </div>
                        ))
                      )}
                      {live.length > 2 && <span className="muted" style={{ fontSize: 12.5 }}>+{live.length - 2} more</span>}
                    </td>
                    <td><Badge tone={c.kyc_status === "verified" ? "good" : c.kyc_status === "pending" ? "warn" : "bad"}>{c.kyc_status}</Badge></td>
                    <td>{c.whatsapp_opt_in ? <Badge tone="good">Opted in</Badge> : <Badge>No</Badge>}</td>
                    <td className="sticky-end">
                      <MemberActions
                        member={{ id: c.id, name: c.name, phone: c.phone, email: c.email, gender: c.gender, birthday: c.birthday, pan: c.pan, is_business: c.is_business, whatsapp_opt_in: c.whatsapp_opt_in, kyc_status: c.kyc_status }}
                        coupons={mine}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
