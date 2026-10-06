import Link from "next/link";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Stat } from "@/components/kit";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import { PAYMENT_METHODS } from "@/lib/ops-calc";
import { addDays, isYmd, istToday, prettyDay } from "@/lib/ops-time";
import type { Invoice } from "@/lib/types";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ date?: string; q?: string; view?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const today = istToday();
  const date = sp.date && isYmd(sp.date) ? sp.date : today;
  const q = (sp.q ?? "").trim().slice(0, 50).toLowerCase();
  const view = sp.view === "unpaid" ? "unpaid" : "day";

  let rows: Invoice[];
  let heading: string;
  if (q) {
    // Search the last year by number, name or phone.
    const year = await db.query("invoices", { gte: { invoice_date: addDays(today, -366) }, order: { column: "created_at", ascending: false } });
    const digits = q.replace(/\D/g, "");
    rows = year.filter((i) => i.invoice_no.toLowerCase().includes(q) || i.client_name.toLowerCase().includes(q) || (digits.length >= 4 && i.client_phone.includes(digits))).slice(0, 200);
    heading = `${rows.length} match${rows.length === 1 ? "" : "es"} for “${sp.q}” in the last year`;
  } else if (view === "unpaid") {
    rows = (await db.query("invoices", { eq: { status: "issued" }, in: { payment_status: ["unpaid", "partial"] }, order: { column: "created_at", ascending: false }, limit: 300 }));
    heading = "Bills with money still to collect";
  } else {
    rows = await db.query("invoices", { eq: { invoice_date: date }, order: { column: "created_at", ascending: false } });
    heading = prettyDay(date, { weekday: "long", day: "numeric", month: "long" });
  }
  const items = await db.queryIn("invoice_items", "invoice_id", rows.map((r) => r.id));
  const staff = await db.list("staff");
  const team = new Map(staff.map((s) => [s.id, s.name.split(" ")[0]]));
  const linesBy = new Map<string, typeof items>();
  for (const it of items) linesBy.set(it.invoice_id, [...(linesBy.get(it.invoice_id) ?? []), it]);
  const issued = rows.filter((r) => r.status === "issued");
  const revenue = issued.reduce((a, r) => a + r.total, 0);
  const collected = issued.reduce((a, r) => a + r.amount_paid, 0);

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Front desk"
        title="Invoices"
        sub="Every bill, numbered in sequence for the financial year. Bills are voided, never deleted."
        actions={<Link className="btn primary" href="/invoices/new">New bill</Link>}
      />

      <div className="grid g-4">
        <Stat label={q || view === "unpaid" ? "Bills shown" : "Bills this day"} value={num(issued.length)} delta={rows.length > issued.length ? `${rows.length - issued.length} void` : undefined} />
        <Stat label="Billed" value={inr(revenue)} delta={issued.length ? `avg ${inr(revenue / issued.length)}` : undefined} />
        <Stat label="Collected" value={inr(collected)} />
        <Stat label="To collect" value={inr(revenue - collected)} tone={revenue - collected > 0 ? "down" : undefined} delta={revenue - collected > 0 ? "part-paid or unpaid" : "all settled"} />
      </div>

      <Card className="mt-24">
        <div className="row wrap between" style={{ marginBottom: 16 }}>
          <form className="row wrap" action="/invoices">
            <input type="date" name="date" defaultValue={date} className="input" aria-label="Bill date" style={{ width: 170 }} />
            <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Search number, name or phone" aria-label="Search invoices" style={{ width: 260 }} maxLength={50} />
            <button className="btn" type="submit">Show</button>
            {(q || view !== "day" || date !== today) && <Link className="btn ghost" href="/invoices">Today</Link>}
          </form>
          <div className="tabs">
            <Link href={`/invoices?date=${addDays(date, -1)}`}>← Prev day</Link>
            <Link href="/invoices?view=unpaid" className={view === "unpaid" && !q ? "on" : ""}>To collect</Link>
            <Link href={`/invoices?date=${addDays(date, 1)}`}>Next day →</Link>
          </div>
        </div>
        <h3 style={{ fontWeight: 650, marginBottom: 10 }}>{heading}</h3>
        {rows.length === 0 ? (
          <div className="empty">No bills here yet. <Link href="/invoices/new" style={{ textDecoration: "underline" }}>Create one</Link>.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Number</th><th>Guest</th><th>Items</th><th>Stylists</th><th className="r">Total</th><th>Payment</th><th>When</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const lines = linesBy.get(r.id) ?? [];
                  return (
                    <tr key={r.id} style={{ opacity: r.status === "void" ? 0.5 : 1 }}>
                      <td className="mono"><Link href={`/invoices/${r.id}`} style={{ fontWeight: 600, textDecoration: "underline" }}>{r.invoice_no}</Link>{r.status === "void" && <div><Badge tone="bad">Void</Badge></div>}</td>
                      <td>{r.client_name}<div className="muted" style={{ fontSize: 12.5 }}>+{r.client_phone}</div></td>
                      <td style={{ maxWidth: 260 }}>{lines.map((l) => l.description).join(", ") || "—"}</td>
                      <td>{[...new Set(lines.map((l) => team.get(l.staff_id) ?? "?"))].join(", ")}</td>
                      <td className="r"><b>{inr(r.total)}</b></td>
                      <td>
                        <Badge tone={r.payment_status === "paid" ? "good" : r.payment_status === "partial" ? "warn" : "bad"}>{r.payment_status === "paid" ? PAYMENT_METHODS[r.payment_method] : r.payment_status === "partial" ? `${inr(r.amount_paid)} of ${inr(r.total)}` : "Unpaid"}</Badge>
                      </td>
                      <td className="muted num" style={{ whiteSpace: "nowrap" }}>{r.invoice_date === today ? formatDate(r.created_at, { hour: "numeric", minute: "2-digit" }) : prettyDay(r.invoice_date, { day: "numeric", month: "short" })}</td>
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
