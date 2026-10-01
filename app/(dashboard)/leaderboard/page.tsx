import Link from "next/link";
import { Avatar, Card, DemoBanner, num, PageHeader, TierBadge } from "@/components/kit";
import * as db from "@/lib/db";
import { DAY, istDay } from "@/lib/engine";

const BOARDS = {
  points: { label: "Lifetime points", unit: "pts" },
  visits: { label: "Visits this quarter", unit: "visits" },
  referrals: { label: "Referrals", unit: "friends" },
} as const;
type Board = keyof typeof BOARDS;

export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const { by: raw = "points" } = await searchParams;
  const by: Board = raw in BOARDS ? (raw as Board) : "points";
  const [customers, tiers, visits, referrals, settings] = await Promise.all([db.list("customers"), db.list("tiers"), db.query("visits", { gte: { at: new Date(Date.now() - 90 * 86_400_000).toISOString() } }), db.list("referrals"), db.getSettings()]);
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const since = Date.now() - 90 * DAY;

  const score = new Map<string, number>();
  if (by === "points") customers.forEach((c) => score.set(c.id, c.lifetime_points));
  if (by === "visits") {
    // A visit = a distinct day at the salon, not each service line.
    const days = new Map<string, Set<string>>();
    visits.filter((v) => new Date(v.at).getTime() >= since).forEach((v) => (days.get(v.customer_id) ?? days.set(v.customer_id, new Set()).get(v.customer_id)!).add(istDay(v.at)));
    days.forEach((d, id) => score.set(id, d.size));
  }
  if (by === "referrals") referrals.filter((r) => r.level === 1 && r.status !== "pending").forEach((r) => score.set(r.referrer_id, (score.get(r.referrer_id) ?? 0) + 1));

  const ranked = customers
    .map((c) => ({ c, s: score.get(c.id) ?? 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 15);
  const max = ranked[0]?.s ?? 1;
  const shareText = [`🏆 ${settings.salon_name} leaderboard · ${BOARDS[by].label}`, ...ranked.slice(0, 10).map(({ c, s }, i) => `${i + 1}. ${c.name.split(" ")[0]} · ${num(s)} ${BOARDS[by].unit}`)].join("\n");
  const TICKS = 48;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Rewards"
        title="Leaderboard"
        sub="Friendly competition drives visits. Share the top 10 on WhatsApp or show it on the salon TV."
        actions={
          <>
            <div className="tabs">
              {(Object.keys(BOARDS) as Board[]).map((b) => (
                <Link key={b} href={`/leaderboard?by=${b}`} className={by === b ? "on" : ""}>{BOARDS[b].label}</Link>
              ))}
            </div>
            {ranked.length > 0 && (
              <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">Share top 10 on WhatsApp</a>
            )}
          </>
        }
      />
      <div style={{ background: "var(--subtle)", borderRadius: 28, padding: "32px 20px" }}>
        <Card className="flat">
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 className="card-title" style={{ textAlign: "center", marginBottom: 8 }}>{BOARDS[by].label}</h2>
            {ranked.length === 0 && <div className="empty">No scores yet.</div>}
            {ranked.map(({ c, s }, i) => {
              const t = tierById.get(c.tier_id);
              const on = Math.round((s / max) * TICKS);
              return (
                <div key={c.id} className="row" style={{ gap: 16, padding: "14px 0", opacity: i < 5 ? 1 : Math.max(0.35, 1 - (i - 4) * 0.09) }}>
                  <span className="num muted" style={{ width: 18, textAlign: "right" }}>{i + 1}</span>
                  <Avatar name={c.name} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row between">
                      <span className="row" style={{ gap: 8, fontWeight: 600 }}>
                        {c.name} {i < 3 && <span aria-hidden>{["🥇", "🥈", "🥉"][i]}</span>}
                      </span>
                      <b className="num">{num(s)} <span className="muted" style={{ fontWeight: 500 }}>{BOARDS[by].unit}</span></b>
                    </div>
                    <div className="ticks mt-8" aria-hidden>
                      {Array.from({ length: TICKS }, (_, k) => <i key={k} className={k < on ? "" : "off"} />)}
                    </div>
                  </div>
                  <span style={{ width: 92, display: "flex", justifyContent: "flex-end" }}>
                    {t && <TierBadge name={t.name} color={t.color} />}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
