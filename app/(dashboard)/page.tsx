import Link from "next/link";
import { DemoBanner, compactInr, inr, num, pct } from "@/components/kit";
import { Button } from "@/components/ui/button";
import Dashboard from "@/components/ui/dashboard-4";
import type { DashboardData } from "@/components/ui/dashboard-4-utils/types";
import { activeWithin, campaignStats, churnSignals, lastMonths, monthly, rewardCost } from "@/lib/analytics";
import * as db from "@/lib/db";
import { DAY, istMonthKey, localHour } from "@/lib/engine";
import { loadSnapshot, previewAutomations } from "@/lib/runner";

export default async function Overview() {
  const snap = await loadSnapshot(); // members, last ~13 months of visits, live coupons
  const { customers, visits, services, tiers, settings } = snap;
  const [plan, campaigns, redeemed90, queued] = await Promise.all([
    previewAutomations(Date.now(), snap),
    db.list("campaigns"),
    db.query("coupons", { eq: { status: "redeemed" }, gte: { redeemed_at: new Date(Date.now() - 90 * 86_400_000).toISOString() } }),
    db.count("messages", { eq: { status: "queued" } }),
  ]);
  const coupons = [...snap.coupons, ...redeemed90];
  const messages = await db.queryIn("messages", "campaign_id", campaigns.map((c) => c.id));
  const now = Date.now();
  const ago = (iso: string) => now - new Date(iso).getTime();

  // Monthly revenue + distinct new vs returning guests.
  const months = lastMonths(12, now);
  const revenue = monthly(visits, (v) => v.at, (v) => v.amount, months);
  const firstVisit = new Map<string, string>();
  for (const v of [...visits].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) if (!firstVisit.has(v.customer_id)) firstVisit.set(v.customer_id, v.at);
  const perMonth = months.map(() => ({ fresh: new Set<string>(), back: new Set<string>() }));
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const v of visits) {
    const key = istMonthKey(v.at);
    const i = idx.get(key);
    if (i === undefined) continue;
    (istMonthKey(firstVisit.get(v.customer_id)!) === key ? perMonth[i].fresh : perMonth[i].back).add(v.customer_id);
  }

  // Headline numbers.
  const rev30 = visits.filter((v) => ago(v.at) <= 30 * DAY).reduce((a, v) => a + v.amount, 0);
  const rev60 = visits.filter((v) => ago(v.at) > 30 * DAY && ago(v.at) <= 60 * DAY).reduce((a, v) => a + v.amount, 0);
  const revDelta = rev60 ? ((rev30 - rev60) / rev60) * 100 : 0;
  const active90 = activeWithin(customers, 90, now);
  const repeaters = customers.filter((c) => c.visit_count >= 2).length;
  const rev90 = visits.filter((v) => ago(v.at) <= 90 * DAY).reduce((a, v) => a + v.amount, 0);
  const cost90 = rewardCost(coupons, now - 90 * DAY) + campaigns.filter((c) => ago(c.starts_at) <= 90 * DAY).reduce((a, c) => a + c.cost, 0);
  const costPct = rev90 ? (cost90 / rev90) * 100 : 0;
  const withinBudget = costPct <= settings.reward_budget_pct;

  // Services ranked by member revenue over the last 90 days.
  const byService = new Map<string, { revenue: number; visits: number }>();
  for (const v of visits) {
    if (ago(v.at) > 90 * DAY) continue;
    const s = byService.get(v.service_id) ?? { revenue: 0, visits: 0 };
    s.revenue += v.amount;
    s.visits += 1;
    byService.set(v.service_id, s);
  }
  const ranked = services
    .map((s) => ({ name: s.name, ...(byService.get(s.id) ?? { revenue: 0, visits: 0 }) }))
    .filter((s) => s.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Today's workload for the quick actions.
  const liveOffers = coupons.filter((c) => c.status === "active" && c.customer_id);
  const expiringSoon = liveOffers.filter((c) => new Date(c.expires_at).getTime() - now < 3 * DAY).length;
  const milestone = snap.rules.find((r) => r.type === "milestone_offer");
  const threshold = milestone ? (milestone.config as { points_threshold: number }).points_threshold : 150;
  const nearMilestone = customers.filter((c) => c.points >= threshold * 0.8 && c.points < threshold).length;
  const joined30 = customers.filter((c) => ago(c.joined_at) <= 30 * DAY).length;
  const liveCampaigns = campaigns.filter((c) => c.status === "live" && Date.parse(c.ends_at) > now).length;

  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const results = campaigns.map((c) => ({ c, r: campaignStats(c, messages, visits, now) }));
  const campaignRev = results.reduce((a, x) => a + x.r.revenue, 0);
  const campaignCost = results.reduce((a, x) => a + x.r.cost, 0);

  const data: DashboardData = {
    stats: [
      {
        label: "Member revenue · 30 days",
        value: compactInr(rev30),
        note: "Service revenue from loyalty members",
        trend: { dir: revDelta >= 0 ? "up" : "down", text: pct(Math.abs(revDelta)) },
        tone: revDelta >= 0 ? "good" : "bad",
      },
      { label: "Active members · 90 days", value: num(active90), note: `of ${num(customers.length)} enrolled · ${joined30} joined this month` },
      { label: "Repeat-visit rate", value: pct((repeaters / Math.max(1, customers.length)) * 100, 0), note: "Members with 2+ visits" },
      {
        label: "Loyalty cost · 90 days",
        value: pct(costPct),
        note: `Budget ${settings.reward_budget_pct}% of member revenue`,
        trend: { dir: withinBudget ? "down" : "up", text: withinBudget ? "Within budget" : "Over budget" },
        tone: withinBudget ? "good" : "bad",
      },
    ],
    months: months.map((m, i) => ({ month: m.label, revenue: revenue[i], returning: perMonth[i].back.size, fresh: perMonth[i].fresh.size })),
    services: ranked,
    actions: [
      { href: "/customers#record", title: "Record a visit", description: `Awards points instantly · ${nearMilestone} guests are close to the ${threshold}-point offer`, icon: "scissors" },
      { href: "/onboarding#add", title: "Add a member", description: "Walk-in, POS or WhatsApp signup", icon: "user-plus" },
      { run: true, title: "Run automations now", description: "Check every rule and queue today's WhatsApp messages", icon: "zap", badge: plan.length ? `${plan.length} due` : undefined },
      { href: "/outbox", title: "Open the outbox", description: "Send queued WhatsApp messages with one tap", icon: "send", badge: queued ? `${queued} queued` : undefined },
      { href: "/rewards#redeem", title: "Redeem a coupon", description: `${liveOffers.length} live offers · ${expiringSoon} expire within 3 days`, icon: "ticket" },
      { href: "/campaigns", title: "Launch an engagement", description: `${liveCampaigns} campaign${liveCampaigns === 1 ? "" : "s"} live right now`, icon: "megaphone" },
    ],
    churn: churnSignals(customers, visits, services, now)
      .slice(0, 5)
      .map((x) => ({
        id: x.customer.id,
        name: x.customer.name,
        lastVisit: `${x.since} days ago`,
        cycle: `${x.cycle} days`,
        spend: inr(x.customer.total_spend),
        high: x.risk >= 2,
      })),
    top: [...customers]
      .sort((a, b) => b.lifetime_points - a.lifetime_points)
      .slice(0, 5)
      .map((c) => {
        const t = tierById.get(c.tier_id);
        return { id: c.id, name: c.name, points: num(c.lifetime_points), tier: t?.name ?? "", tierColor: t?.color ?? "#999" };
      }),
    campaigns: {
      revenue: compactInr(campaignRev),
      cost: compactInr(campaignCost),
      roi: campaignCost ? `${(campaignRev / campaignCost).toFixed(1)}×` : "—",
      live: results.slice(-3).reverse().map(({ c, r }) => ({ name: c.name, status: r.status, detail: `${num(r.sent)} sent · ${num(r.converted)} booked` })),
    },
  };

  const hour = localHour(now, settings.timezone);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{settings.salon_name}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground">Revenue from members, today&apos;s WhatsApp workload, and who needs a nudge.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/customers#record">Record a visit</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/automations">Automations</Link>
          </Button>
        </div>
      </div>
      <Dashboard data={data} />
    </>
  );
}
