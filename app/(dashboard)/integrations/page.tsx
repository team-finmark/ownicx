import { Badge, Card, DemoBanner, PageHeader } from "@/components/kit";
import * as db from "@/lib/db";
import { whatsappMode } from "@/lib/whatsapp";

const ENDPOINTS = [
  { m: "GET", p: "/api/v1/customers?phone=91…", d: "Look up a member, their points and tier" },
  { m: "POST", p: "/api/v1/customers", d: "Enrol a member (runs KYC and records the referral)" },
  { m: "POST", p: "/api/v1/visits", d: "Record a paid visit. Awards points, upgrades tier, fires milestone offers" },
  { m: "POST", p: "/api/v1/coupons/redeem", d: "Validate and redeem a coupon code at checkout" },
  { m: "GET", p: "/api/automations/run", d: "Cron entrypoint. Evaluates rules for the current send hour" },
  { m: "GET/POST", p: "/api/whatsapp/webhook", d: "WhatsApp Cloud API webhook for JOIN signups and replies" },
];

const CONNECTORS = [
  { name: "POS / billing", how: "POST /visits on every paid invoice", kind: "REST" },
  { name: "Booking app", how: "Booking link in every reminder; POST /visits on checkout", kind: "REST" },
  { name: "eCommerce (retail products)", how: "Order webhook → POST /visits", kind: "Webhook" },
  { name: "CRM / CDP", how: "GET /customers for profile sync; segments as tags", kind: "REST" },
  { name: "Marketing automation", how: "Segments + Outbox; campaigns need no code", kind: "No-code" },
];

export default async function Integrations() {
  const mode = await whatsappMode();
  const connectors = [...CONNECTORS, { name: "WhatsApp", how: mode === "cloud_api" ? "Cloud API (auto-send) · manage in Settings → WhatsApp" : "Tap-to-send links (₹0) · connect in Settings → WhatsApp", kind: "Built-in" }];
  const key = process.env.OWNICX_API_KEY;
  const masked = key ? `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 4))}` : "Set OWNICX_API_KEY in .env.local";

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Growth & control"
        title="API & integrations"
        sub="Ownicx slots in as the dedicated loyalty logic engine. Engineers connect over REST, marketers run campaigns without code, and nothing in your current stack is displaced."
      />
      <div className="grid g-3">
        <div className="pill-stat"><span className="v">&lt; 120 ms</span><span className="l">Target API response (p50)</span></div>
        <div className="pill-stat"><span className="v">99.99%</span><span className="l">Uptime SLA target</span></div>
        <div className="pill-stat"><span className="v">Idempotent</span><span className="l">One message per trigger, safe to retry</span></div>
      </div>

      <div className="grid g-main mt-16">
        <Card title="REST API" sub="JSON over HTTPS · header x-api-key">
          <div className="row between" style={{ marginBottom: 14 }}>
            <span className="text-2">API key</span>
            <span className="mono">{masked}</span>
          </div>
          <div className="table-wrap" style={{ marginBottom: 0 }}>
            <table className="tbl">
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.p}>
                    <td style={{ width: 90 }}><Badge tone={e.m === "GET" ? "good" : "accent"}>{e.m}</Badge></td>
                    <td className="mono">{e.p}</td>
                    <td className="text-2">{e.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Record a visit from your POS">
          <div className="code-block">{`curl -X POST https://<your-app>/api/v1/visits \\
  -H "x-api-key: $OWNICX_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "phone": "919876543210",
    "service_id": "haircut",
    "amount": 600
  }'

→ { "points_earned": 5, "balance": 150,
    "tier": "Gold", "offers_issued": 1 }`}</div>
        </Card>
      </div>

      <h2 className="section-title">Connectors</h2>
      <div className="grid g-3">
        {connectors.map((c) => (
          <Card key={c.name} className="flat">
            <div className="row between">
              <b>{c.name}</b>
              <Badge>{c.kind}</Badge>
            </div>
            <p className="text-2 mt-8" style={{ fontSize: 13 }}>{c.how}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
