import { saveSettings } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, PageHeader, Person, Stat } from "@/components/kit";
import * as db from "@/lib/db";
import { financialYear, tdsReport } from "@/lib/engine";

export default async function Compliance() {
  const now = Date.now();
  const fy = financialYear(now);
  // Only this financial year's redeemed benefits, only for business members.
  const [customers, coupons, settings] = await Promise.all([
    db.query("customers", { eq: { is_business: true } }),
    db.query("coupons", { eq: { status: "redeemed" }, gte: { redeemed_at: new Date(fy.start).toISOString() } }),
    db.getSettings(),
  ]);
  const rows = tdsReport(customers, coupons, settings, now);
  const liable = rows.filter((r) => r.applicable);
  const totalTds = liable.reduce((a, r) => a + r.tds, 0);
  const missingPan = rows.filter((r) => !r.customer.pan);
  const nearing = rows.filter((r) => !r.applicable && r.benefits >= settings.tds_threshold * 0.75);
  // RFC 4180 quoting + formula-injection guard (a name like "=HYPERLINK(...)" must stay text in Excel).
  const cell = (v: string | number) => {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csvRows = [
    ["Member", "Phone", "PAN", "Benefits (INR)", "Rate %", "TDS (INR)", "Status"],
    ...rows.map((r) => [r.customer.name, r.customer.phone, r.customer.pan ?? "NOT FURNISHED", r.benefits, r.rate, r.tds, r.applicable ? "Deduct" : "Below threshold"]),
  ];
  // BOM so Excel opens it as UTF-8 (₹, names in Indian scripts).
  const csv = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csvRows.map((row) => row.map(cell).join(",")).join("\r\n"));

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Growth & control"
        title="194R compliance & TDS"
        sub={`Section 194R requires TDS on business benefits or perquisites worth over ₹${settings.tds_threshold.toLocaleString("en-IN")} to one person in a financial year. Personal-use guest discounts are outside it, so only business members (collab stylists, influencers, corporate partners) are tracked.`}
        actions={<a className="btn" href={csv} download={`194R-${fy.label.replace(" ", "-")}.csv`}>Export for Form 26Q</a>}
      />
      <div className="grid g-4">
        <Stat label={`Business members · ${fy.label}`} value={rows.length} />
        <Stat label="Over threshold" value={liable.length} delta={`${nearing.length} within 25% of it`} tone={nearing.length ? "down" : undefined} />
        <Stat label="TDS to deduct" value={inr(totalTds)} delta="deposit by the 7th of next month" />
        <Stat label="PAN missing" value={missingPan.length} delta="20% rate applies (s.206AA)" tone={missingPan.length ? "down" : "up"} />
      </div>

      <div className="grid g-main mt-16">
        <Card title={`Benefit ledger · ${fy.label}`} sub="Redeemed coupons, gifts and complimentary services, valued at fair market value">
          {rows.length === 0 ? (
            <div className="empty">No business members yet. Flag them during onboarding.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Member</th><th>PAN</th><th className="r">Benefits</th><th style={{ width: 160 }}>vs ₹{(settings.tds_threshold / 1000).toFixed(0)}k threshold</th><th className="r">Rate</th><th className="r">TDS</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.customer.id}>
                      <td><Person name={r.customer.name} sub={`${r.count} benefit(s)`} /></td>
                      <td className="mono">{r.customer.pan ?? <Badge tone="bad">Not furnished</Badge>}</td>
                      <td className="r">{inr(r.benefits)}</td>
                      <td>
                        <div className="bar"><i style={{ width: `${Math.min(100, (r.benefits / settings.tds_threshold) * 100)}%`, background: r.applicable ? "var(--bad)" : "var(--hl)" }} /></div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{r.applicable ? "Threshold crossed" : `${inr(r.headroom)} headroom`}</div>
                      </td>
                      <td className="r">{r.rate}%</td>
                      <td className="r"><b>{r.tds ? inr(r.tds) : "—"}</b></td>
                      <td>{r.applicable ? <Badge tone="bad">Deduct</Badge> : <Badge tone="good">Below</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Rates & threshold">
            <ActionForm action={saveSettings} className="stack" style={{ gap: 12 }}>
              <div className="field"><label htmlFor="t-th">Annual threshold (₹)</label><input id="t-th" name="tds_threshold" type="number" className="input" defaultValue={settings.tds_threshold} /></div>
              <div className="grid g-2" style={{ gap: 10 }}>
                <div className="field"><label htmlFor="t-r">Rate with PAN %</label><input id="t-r" name="tds_rate" type="number" className="input" defaultValue={settings.tds_rate} /></div>
                <div className="field"><label htmlFor="t-n">Without PAN %</label><input id="t-n" name="tds_rate_no_pan" type="number" className="input" defaultValue={settings.tds_rate_no_pan} /></div>
              </div>
              <Submit>Save</Submit>
            </ActionForm>
          </Card>
          <Card title="Documentation trail">
            <div className="list" style={{ fontSize: 13 }}>
              <div className="list-item"><span>Every benefit logged with value, date &amp; code</span><Badge tone="good">On</Badge></div>
              <div className="list-item"><span>Aggregation per PAN per financial year</span><Badge tone="good">On</Badge></div>
              <div className="list-item"><span>Quarterly 26Q export (CSV)</span><Badge tone="good">On</Badge></div>
              <div className="list-item"><span>%-off coupons valued from the bill at redemption</span><Badge tone="good">On</Badge></div>
              <div className="list-item"><span>Form 16A issue to recipients</span><Badge>Via your CA</Badge></div>
            </div>
            <p className="muted mt-16" style={{ fontSize: 12 }}>Where the benefit is in kind, the salon either collects the TDS amount from the recipient before release or pays it itself. Confirm treatment with your tax advisor.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
