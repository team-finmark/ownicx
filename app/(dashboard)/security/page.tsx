import { Badge, Card, DemoBanner, PageHeader } from "@/components/kit";
import Link from "next/link";
import { CERTS, certState } from "@/lib/certs";
import * as db from "@/lib/db";

const CONTROLS = [
  ["Row-level security", "Enabled on every Supabase table; the browser never holds a key that can read member data"],
  ["Server-only secrets", "Service-role key and WhatsApp token are only used in server actions and API routes"],
  ["API authentication", "Every REST call needs x-api-key; cron endpoint needs a bearer secret"],
  ["Consent-first messaging", "Automations only message members who opted in to WhatsApp"],
  ["Idempotent sends", "Unique dedupe key per trigger stops duplicate messages on retries"],
  ["Data minimisation", "Only name, phone, and optional email/birthday/PAN are stored. PAN is kept only for 194R"],
];

export default async function Security() {
  const settings = await db.getSettings();
  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader eyebrow="Growth & control" title="Security & trust" sub="Controls built into this dashboard, and the assurance program behind it." />
      <div className="grid g-2">
        <Card title="Assurance program" sub="Switched on by your manager in Settings" action={<Link className="btn sm" href="/settings#certifications">Manage</Link>}>
          <div className="list">
            {CERTS.map((c) => {
              const st = certState(settings.certifications, c.key);
              const link = st.evidence && /^https?:\/\//i.test(st.evidence) ? st.evidence : null;
              return (
                <div className="list-item" key={c.key}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {c.what}
                      {st.on && st.evidence && (
                        <>
                          {" · "}
                          {link ? <a href={link} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>view evidence</a> : st.evidence}
                        </>
                      )}
                    </div>
                  </div>
                  {st.on ? <Badge tone="good">✓ {c.onLabel}</Badge> : <Badge tone="outline">Not claimed</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Built-in controls">
          <div className="list">
            {CONTROLS.map(([t, d]) => (
              <div className="list-item" key={t} style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{d}</div>
                </div>
                <Badge tone="good">On</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
