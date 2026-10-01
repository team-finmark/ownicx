import Link from "next/link";
import { markMessage, runAutomationsNow } from "@/app/actions";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, PageHeader, Person } from "@/components/kit";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import { waLink } from "@/lib/whatsapp";

const TABS = ["queued", "sent", "failed", "skipped"] as const;

export default async function Outbox({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw = "queued" } = await searchParams;
  const tab = TABS.includes(raw as (typeof TABS)[number]) ? raw : "queued";
  // One tab at a time, newest 200; inbound ledger rows (guest replies) aren't outgoing messages.
  const [page, rules, campaigns, ...tabCounts] = await Promise.all([
    db.query("messages", { eq: { status: tab }, order: { column: "created_at", ascending: false }, limit: 200 }),
    db.list("automation_rules"),
    db.list("campaigns"),
    ...TABS.map((t) => db.count("messages", { eq: { status: t } })),
  ]);
  const messages = page.filter((m) => !(m.status === "skipped" && (m.dedupe_key.startsWith("inbound:") || m.dedupe_key.startsWith("refms:"))));
  const customers = await db.queryIn("customers", "id", messages.map((m) => m.customer_id));
  const cById = new Map(customers.map((c) => [c.id, c]));
  const rName = new Map(rules.map((r) => [r.id, r.name]));
  const cmpName = new Map(campaigns.map((c) => [c.id, c.name]));
  const counts = Object.fromEntries(TABS.map((t, i) => [t, tabCounts[i]]));
  const shown = messages.filter((m) => m.status === tab).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="WhatsApp AI"
        title="Outbox"
        sub="Every message the automations and campaigns created. Tap Send to open WhatsApp with the message ready, then mark it sent."
        actions={
          <ActionForm action={runAutomationsNow}>
            <Submit>Run automations</Submit>
          </ActionForm>
        }
      />
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t} href={`/outbox?tab=${t}`} className={tab === t ? "on" : ""}>
            {t[0].toUpperCase() + t.slice(1)} <span className="muted num">{counts[t]}</span>
          </Link>
        ))}
      </div>
      <Card>
        {shown.length === 0 ? (
          <div className="empty">{tab === "queued" ? "Nothing waiting. Run automations to check who's due." : `No ${tab} messages.`}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>To</th><th>Message</th><th>Source</th><th>Created</th><th style={{ width: 200 }} /></tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map((m) => {
                  const c = cById.get(m.customer_id);
                  return (
                    <tr key={m.id}>
                      <td><Person name={c?.name ?? "Unknown"} sub={c ? `+${c.phone}` : ""} /></td>
                      <td style={{ maxWidth: 440 }}>
                        <div className="bubble" style={{ fontSize: 12.5 }}>{m.body}</div>
                        {m.error && <div style={{ color: "var(--bad)", fontSize: 12, marginTop: 6 }}>{m.error}</div>}
                      </td>
                      <td>
                        <Badge>{m.rule_id ? rName.get(m.rule_id) ?? "Rule" : m.campaign_id ? cmpName.get(m.campaign_id) ?? "Campaign" : "History"}</Badge>
                      </td>
                      <td className="num text-2" style={{ whiteSpace: "nowrap" }}>{formatDate(m.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td>
                        {(m.status === "queued" || m.status === "failed") && c && (
                          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                            <Link className="btn sm" href={`/simulator?message=${m.id}`}>▶ Simulate</Link>
                            {c.segment.includes("mock") ? (
                              <Badge tone="warn">Demo member · not sendable</Badge>
                            ) : (
                              <>
                                <a className="btn wa sm" href={waLink(c.phone, m.body)} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                                <ActionButton action={markMessage.bind(null, m.id, "sent")}>Mark sent</ActionButton>
                              </>
                            )}
                            <ActionButton className="btn ghost sm" action={markMessage.bind(null, m.id, "skipped")}>Skip</ActionButton>
                          </div>
                        )}
                        {m.status === "sent" && m.sent_at && <span className="muted" style={{ fontSize: 12 }}>Sent {formatDate(m.sent_at, { day: "numeric", month: "short" })}</span>}
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
