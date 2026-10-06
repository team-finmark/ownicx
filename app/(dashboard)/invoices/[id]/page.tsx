import Link from "next/link";
import { notFound } from "next/navigation";
import { paymentAction, voidInvoiceAction } from "@/app/ops-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, PageHeader } from "@/components/kit";
import { PrintButton } from "@/components/PrintButton";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import { invoiceWhatsAppLink } from "@/lib/ops";
import { PAYMENT_METHODS } from "@/lib/ops-calc";
import { prettyDay } from "@/lib/ops-time";

const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function InvoiceView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const me = await requireManager();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const inv = await db.get("invoices", id);
  if (!inv) notFound();
  const [items, staff, settings] = await Promise.all([db.query("invoice_items", { eq: { invoice_id: id } }), db.list("staff"), db.getSettings()]);
  const team = new Map(staff.map((s) => [s.id, s.name]));
  const isVoid = inv.status === "void";
  const due = Math.max(0, inv.total - inv.amount_paid);

  return (
    <>
      <div className="no-print">
        <DemoBanner demo={db.isDemo()} />
        <PageHeader
          eyebrow="Invoice"
          title={inv.invoice_no}
          sub={`${inv.client_name} · ${prettyDay(inv.invoice_date)} · created by ${inv.created_by ?? "—"} at ${formatDate(inv.created_at, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}`}
          actions={
            <>
              <Link className="btn" href="/invoices">All invoices</Link>
              <PrintButton />
              {!isVoid && <a className="btn wa" href={invoiceWhatsAppLink(inv, settings.salon_name)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
              <Link className="btn primary" href="/invoices/new">New bill</Link>
            </>
          }
        />
        {created && !isVoid && (
          <div className="callout good" role="status" style={{ marginBottom: 16, fontSize: 14 }}>
            Bill saved{inv.loyalty_points ? ` · ${inv.client_name.split(" ")[0]} earned ${inv.loyalty_points} loyalty points` : ""}. Print it or send it on WhatsApp.
          </div>
        )}
      </div>

      <div className="grid g-main">
        <article className="card invoice-sheet" aria-label={`Invoice ${inv.invoice_no}`}>
          {isVoid && <div className="void-stamp" aria-hidden>VOID</div>}
          <header className="row between" style={{ alignItems: "flex-start", gap: 24 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>{settings.salon_name}</div>
              {settings.salon_address && <div className="text-2" style={{ fontSize: 13.5, maxWidth: 320 }}>{settings.salon_address}</div>}
              {settings.salon_phone && <div className="text-2" style={{ fontSize: 13.5 }}>{settings.salon_phone}</div>}
              {settings.gstin && <div className="text-2" style={{ fontSize: 13.5 }}>GSTIN {settings.gstin}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{settings.gstin && inv.tax > 0 ? "TAX INVOICE" : "INVOICE"}</div>
              <div className="mono" style={{ fontSize: 14 }}>{inv.invoice_no}</div>
              <div className="text-2" style={{ fontSize: 13.5 }}>{prettyDay(inv.invoice_date, { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </header>
          <div className="divider" />
          <div style={{ fontSize: 14 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Bill to</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{inv.client_name}</div>
            <div className="text-2">+{inv.client_phone}</div>
            {inv.client_address && <div className="text-2">{inv.client_address}</div>}
          </div>
          <table className="tbl invoice-lines mt-16">
            <thead><tr><th>Description</th><th>Stylist</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.description}{it.item_type === "inventory" && <span className="muted"> · product</span>}</td>
                  <td>{team.get(it.staff_id) ?? "—"}</td>
                  <td className="r">{it.quantity}</td>
                  <td className="r">{rs(it.rate)}</td>
                  <td className="r">{rs(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="kv invoice-totals">
            <dt>Subtotal</dt><dd>{rs(inv.subtotal)}</dd>
            {inv.discount > 0 && <><dt>Discount</dt><dd>− {rs(inv.discount)}</dd></>}
            {inv.tax > 0 && <><dt>Tax ({inv.tax_rate}%)</dt><dd>{rs(inv.tax)}</dd></>}
            <dt style={{ fontWeight: 700, color: "var(--text)" }}>Total</dt><dd style={{ fontWeight: 700, fontSize: 18 }}>{rs(inv.total)}</dd>
            <dt>Paid ({PAYMENT_METHODS[inv.payment_method]})</dt><dd>{rs(inv.amount_paid)}</dd>
            {due > 0 && <><dt style={{ color: "var(--bad)" }}>Balance due</dt><dd style={{ color: "var(--bad)" }}>{rs(due)}</dd></>}
          </dl>
          {inv.loyalty_points > 0 && <p className="text-2" style={{ fontSize: 13.5, marginTop: 18 }}>You earned <b>{inv.loyalty_points} loyalty points</b> on this visit.</p>}
          <p className="muted" style={{ textAlign: "center", fontStyle: "italic", marginTop: 28, fontSize: 13 }}>Thank you for visiting {settings.salon_name}</p>
          {isVoid && <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 12 }}>Voided {inv.voided_at ? formatDate(inv.voided_at) : ""}: {inv.void_reason}</p>}
        </article>

        <div className="stack no-print">
          <Card title="Status">
            <div className="row wrap">
              <Badge tone={isVoid ? "bad" : "good"}>{isVoid ? "Void" : "Issued"}</Badge>
              <Badge tone={inv.payment_status === "paid" ? "good" : inv.payment_status === "partial" ? "warn" : "bad"}>{inv.payment_status === "paid" ? "Paid" : inv.payment_status === "partial" ? `Part paid · ${inr(due)} due` : "Unpaid"}</Badge>
              {inv.appointment_id && <Link href={`/appointments?date=${inv.invoice_date}`} className="badge outline">From a booking</Link>}
            </div>
          </Card>
          {!isVoid && (
            <Card title="Record payment" sub="Update when the guest settles the balance">
              <ActionForm action={paymentAction} className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="id" value={inv.id} />
                <div className="grid g-2" style={{ gap: 10 }}>
                  <div className="field">
                    <label htmlFor="pm">Paid by</label>
                    <select id="pm" name="payment_method" className="select" defaultValue={inv.payment_method}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </div>
                  <div className="field">
                    <label htmlFor="ps">Status</label>
                    <select id="ps" name="payment_status" className="select" defaultValue={inv.payment_status}><option value="paid">Paid in full</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option></select>
                  </div>
                </div>
                <div className="field"><label htmlFor="ap">Amount received ₹ (part paid only)</label><input id="ap" name="amount_paid" type="number" min={0} step="0.01" className="input" defaultValue={inv.payment_status === "partial" ? inv.amount_paid : ""} /></div>
                <Submit className="btn">Save payment</Submit>
              </ActionForm>
            </Card>
          )}
          {!isVoid && me.role === "admin" && (
            <Card title="Void this bill" sub="For mistakes. The number stays used, products go back on the shelf and the guest's points are taken back.">
              <ActionForm action={voidInvoiceAction} globalToast className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="id" value={inv.id} />
                <div className="field"><label htmlFor="vr">Reason</label><input id="vr" name="reason" className="input" required minLength={3} maxLength={200} placeholder="e.g. Billed twice by mistake" /></div>
                <Submit className="btn">Void bill</Submit>
              </ActionForm>
            </Card>
          )}
          {!isVoid && me.role !== "admin" && <p className="muted" style={{ fontSize: 13 }}>Need to cancel this bill? Ask the owner to void it.</p>}
        </div>
      </div>
    </>
  );
}
