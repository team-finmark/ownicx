import Link from "next/link";
import { createRule, runAutomationsNow } from "@/app/actions";
import { RuleEditor } from "@/components/RuleEditor";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, PageHeader, Person } from "@/components/kit";
import * as db from "@/lib/db";
import type { ExpiryConfig, MilestoneConfig, RevisitConfig } from "@/lib/types";
import { loadSnapshot, previewAutomations } from "@/lib/runner";
import { whatsappMode } from "@/lib/whatsapp";

export default async function AutomationsPage() {
  const snap = await loadSnapshot();
  const plan = await previewAutomations(Date.now(), snap);
  const { rules, services, tiers, settings } = snap;
  const mode = await whatsappMode();

  const segs = new Set(snap.customers.flatMap((c) => c.segment));
  const audiences = [
    { value: "all", label: "All opted-in members" },
    ...tiers.map((t) => ({ value: `tier:${t.id}`, label: `${t.name} tier` })),
    ...[...segs].sort().map((s) => ({ value: s, label: `Segment: ${s.replace("_", " ")}` })),
  ];
  const due = new Map<string, number>();
  for (const p of plan) due.set(p.rule.id, (due.get(p.rule.id) ?? 0) + 1);

  const haircut = rules.find((r) => r.type === "revisit_reminder" && (r.config as RevisitConfig).service_id === "haircut");
  const milestone = rules.find((r) => r.type === "milestone_offer");
  const expiry = rules.find((r) => r.type === "expiry_nudge");
  const hc = haircut?.config as RevisitConfig | undefined;
  const ms = milestone?.config as MilestoneConfig | undefined;
  const ex = expiry?.config as ExpiryConfig | undefined;
  const haircutPts = services.find((s) => s.id === "haircut")?.points ?? 5;

  const journey = [
    { t: "Visit", d: `Haircut earns ${haircutPts} pts (× tier multiplier)` },
    { t: `Day ${hc?.days_after ?? 60}`, d: "“Time for a fresh look?” reminder on WhatsApp" },
    { t: `${ms?.points_threshold ?? 150} pts`, d: `₹${ms?.discount_value ?? 150} off unlocked, code sent instantly` },
    { t: "Countdown", d: `Urgency nudges ${ex ? ex.days_before.join(" / ") : "7 / 3 / 1"} days before expiry` },
    { t: `Day ${ms?.validity_days ?? 14}`, d: "Offer expires, points already banked" },
  ];

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="WhatsApp AI"
        title="Automations"
        sub="Rules decide who gets a message and when. Nothing sends unless a trigger fires, and each trigger sends once."
        actions={
          <>
            <Link className="btn" href="/outbox">Outbox</Link>
            <ActionForm action={runAutomationsNow}>
              <Submit>Run now ({plan.length} due)</Submit>
            </ActionForm>
          </>
        }
      />

      <Card title="Guest journey" sub="Built from your live rules — edit a rule below and this updates">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${journey.length}, minmax(0,1fr))`, gap: 10, overflowX: "auto" }}>
          {journey.map((j, i) => (
            <div key={j.t} className="pill-stat" style={{ minWidth: 150, position: "relative" }}>
              <span className="badge accent" style={{ alignSelf: "flex-start", marginBottom: 8 }}>{i + 1}</span>
              <span style={{ fontWeight: 700 }}>{j.t}</span>
              <span className="l" style={{ marginTop: 2 }}>{j.d}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid g-main mt-16">
        <Card title="Due now" sub={`${plan.length} message(s) would be created if you ran automations now`}>
          {plan.length === 0 ? (
            <div className="empty">Nobody is due a message right now.</div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Member</th><th>Rule</th><th>Why</th></tr>
                </thead>
                <tbody>
                  {plan.slice(0, 50).map((p) => (
                    <tr key={p.dedupe_key}>
                      <td><Person name={p.customer.name} sub={`+${p.customer.phone}`} /></td>
                      <td>{p.rule.name}</td>
                      <td className="text-2" style={{ fontSize: 12.5 }}>{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Delivery" sub="How messages leave the dashboard">
          <div className="stack" style={{ gap: 12 }}>
            <div className="row between">
              <span>Mode</span>
              <Badge tone={mode === "cloud_api" ? "violet" : "good"}>{mode === "cloud_api" ? "WhatsApp Cloud API" : "Tap-to-send · ₹0"}</Badge>
            </div>
            <p className="text-2" style={{ fontSize: 13 }}>
              {mode === "cloud_api"
                ? "Messages send automatically from your WhatsApp Business number. Reminders outside a guest's 24-hour reply window need a Meta-approved template."
                : "Each message is queued with a WhatsApp link. The front desk taps Send in the Outbox and WhatsApp opens with the text ready. No API or per-message fees."}
            </p>
            <div className="divider" style={{ margin: "4px 0" }} />
            <div className="text-2" style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>Schedule:</b> an hourly cron calls <span className="mono">/api/automations/run</span>. Each rule only fires in its own send hour ({settings.timezone}). Supabase pg_cron runs it for free; see the README.
            </div>
            <div className="text-2" style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>Consent:</b> only members who opted in to WhatsApp are messaged.
            </div>
            <Link className="btn" href="/settings/whatsapp">WhatsApp settings</Link>
          </div>
        </Card>
      </div>

      <div className="row between mt-24" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Rules</h2>
        <ActionForm action={createRule} className="row">
          <select name="type" className="select" style={{ width: 200 }} aria-label="Rule type" defaultValue="revisit_reminder">
            <option value="revisit_reminder">Revisit reminder</option>
            <option value="milestone_offer">Points milestone offer</option>
            <option value="expiry_nudge">Expiry urgency</option>
            <option value="winback">Win-back</option>
            <option value="birthday">Birthday</option>
          </select>
          <Submit className="btn">Add rule</Submit>
        </ActionForm>
      </div>
      <div className="stack">
        {rules.map((r) => (
          <RuleEditor
            key={r.id}
            rule={r}
            services={services}
            audiences={audiences}
            salon={settings.salon_name}
            bookingLink={settings.booking_link}
            dueCount={due.get(r.id) ?? 0}
          />
        ))}
      </div>
    </>
  );
}
