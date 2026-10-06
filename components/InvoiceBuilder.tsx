"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createInvoiceAction, findMemberAction } from "@/app/ops-actions";
import { ActionForm, Submit } from "./forms";
import { billTotals, PAYMENT_METHODS } from "@/lib/ops-calc";

export interface PickItem {
  key: string; // "service:<id>" | "inventory:<id>"
  name: string;
  price: number;
  stock?: number; // products only
}
export interface PickStaff {
  id: string;
  name: string;
}
interface Line {
  uid: number;
  key: string;
  description: string;
  quantity: string;
  rate: string;
  staff_id: string;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InvoiceBuilder({
  services,
  products,
  staff,
  today,
  prefill,
}: {
  services: PickItem[];
  products: PickItem[];
  staff: PickStaff[];
  today: string;
  prefill?: { appointment_id: string; name: string; phone: string; lines: { key: string; staff_id: string }[] };
}) {
  const all = useMemo(() => new Map([...services, ...products].map((i) => [i.key, i])), [services, products]);
  const uid = useRef(1);
  const blank = (key = "", staffId = ""): Line => {
    const it = all.get(key);
    return { uid: uid.current++, key, description: it?.name ?? "", quantity: "1", rate: it ? String(it.price) : "", staff_id: staffId };
  };
  const [lines, setLines] = useState<Line[]>(() => (prefill?.lines.length ? prefill.lines.map((l) => blank(l.key, l.staff_id)) : [blank()]));
  const [name, setName] = useState(prefill?.name ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [member, setMember] = useState<{ name: string; points: number; visits: number } | null>(null);
  const [discount, setDiscount] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [status, setStatus] = useState("paid");

  // Look the guest up as soon as a full mobile number is typed.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setMember(null);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const m = await findMemberAction(phone);
        if (!live) return;
        setMember(m);
        if (m) setName((n) => n || m.name);
      } catch {
        // Offline: the server still matches the phone when the bill is saved.
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone]);

  const set = (u: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...patch } : l)));
  const pick = (u: number, key: string) => {
    const it = all.get(key);
    set(u, { key, description: it?.name ?? "", rate: it ? String(it.price) : "" });
  };
  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);
  const totals = billTotals(lines.map((l) => ({ quantity: num(l.quantity), rate: num(l.rate) })), num(discount), num(taxRate));
  const payload = JSON.stringify(
    lines
      .filter((l) => l.key)
      .map((l) => ({ item_type: l.key.startsWith("inventory:") ? "inventory" : "service", ref_id: l.key.split(":")[1], description: l.description, quantity: num(l.quantity), rate: num(l.rate), staff_id: l.staff_id })),
  );
  const missingStaff = lines.some((l) => l.key && !l.staff_id);

  return (
    <ActionForm action={createInvoiceAction} className="stack">
      <input type="hidden" name="lines" value={payload} />
      {prefill && <input type="hidden" name="appointment_id" value={prefill.appointment_id} />}

      <section className="card">
        <div className="card-head"><h2 className="card-title">Guest</h2></div>
        <div className="grid g-3" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="iv-phone">Mobile</label>
            <input id="iv-phone" name="client_phone" className="input" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoComplete="off" />
            <span className="hint">{member ? `Member · ${member.points} pts · ${member.visits} visits` : phone.replace(/\D/g, "").length >= 10 ? "New guest — they'll be added as a member" : "Returning members are found by number"}</span>
          </div>
          <div className="field"><label htmlFor="iv-name">Name</label><input id="iv-name" name="client_name" className="input" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
          <div className="field"><label htmlFor="iv-date">Bill date</label><input id="iv-date" name="invoice_date" type="date" className="input" required defaultValue={today} max={today} /></div>
        </div>
        <div className="grid g-2 mt-16" style={{ gap: 12, alignItems: "end" }}>
          <div className="field"><label htmlFor="iv-addr">Address (optional)</label><input id="iv-addr" name="client_address" className="input" maxLength={200} /></div>
          {!member && <label className="row" style={{ gap: 8, fontSize: 14, paddingBottom: 10 }}><input type="checkbox" name="whatsapp_opt_in" /> New guest agrees to WhatsApp updates and offers</label>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2 className="card-title">Services & products</h2><div className="card-sub">Every line needs the stylist who did it — that's what their sales and commission come from.</div></div>
          <button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, blank()])} disabled={lines.length >= 50}>+ Add line</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th style={{ minWidth: 220 }}>Item</th><th style={{ minWidth: 170 }}>Stylist</th><th className="r" style={{ width: 90 }}>Qty</th><th className="r" style={{ width: 130 }}>Rate ₹</th><th className="r">Amount</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const it = all.get(l.key);
                const short = it?.stock !== undefined && num(l.quantity) > it.stock;
                return (
                  <tr key={l.uid}>
                    <td>
                      <select className="select" aria-label={`Line ${i + 1} item`} value={l.key} onChange={(e) => pick(l.uid, e.target.value)} required>
                        <option value="" disabled>Choose…</option>
                        <optgroup label="Services">{services.map((s) => <option key={s.key} value={s.key}>{s.name} · ₹{s.price.toLocaleString("en-IN")}</option>)}</optgroup>
                        {products.length > 0 && <optgroup label="Products">{products.map((p) => <option key={p.key} value={p.key} disabled={!p.stock}>{p.name} · ₹{p.price.toLocaleString("en-IN")} · {p.stock ? `${p.stock} in stock` : "out of stock"}</option>)}</optgroup>}
                      </select>
                      {short && <div style={{ color: "var(--bad)", fontSize: 12.5, marginTop: 4 }}>Only {it?.stock} in stock</div>}
                    </td>
                    <td>
                      <select className="select" aria-label={`Line ${i + 1} stylist`} value={l.staff_id} onChange={(e) => set(l.uid, { staff_id: e.target.value })} required>
                        <option value="" disabled>Who did it?</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="r"><input className="input num-in" style={{ width: 72 }} type="number" min={1} max={999} step={1} aria-label={`Line ${i + 1} quantity`} value={l.quantity} onChange={(e) => set(l.uid, { quantity: e.target.value })} required /></td>
                    <td className="r"><input className="input num-in" style={{ width: 110 }} type="number" min={0} step="0.01" aria-label={`Line ${i + 1} rate`} value={l.rate} onChange={(e) => set(l.uid, { rate: e.target.value })} required /></td>
                    <td className="r num"><b>{rupees(totals.amounts[i] ?? 0)}</b></td>
                    <td className="r">{lines.length > 1 && <button type="button" className="btn sm ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}>✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid g-2">
        <div className="card">
          <div className="card-head"><h2 className="card-title">Payment</h2></div>
          <div className="grid g-2" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="iv-pm">Paid by</label>
              <select id="iv-pm" name="payment_method" className="select" defaultValue="upi">
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="iv-ps">Status</label>
              <select id="iv-ps" name="payment_status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="paid">Paid in full</option><option value="partial">Part paid</option><option value="unpaid">Unpaid</option>
              </select>
            </div>
            {status === "partial" && <div className="field"><label htmlFor="iv-ap">Amount received ₹</label><input id="iv-ap" name="amount_paid" type="number" min={1} step="0.01" className="input" required /></div>}
            <div className="field"><label htmlFor="iv-disc">Discount ₹</label><input id="iv-disc" name="discount" type="number" min={0} step="0.01" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
            <div className="field"><label htmlFor="iv-tax">Tax %</label><input id="iv-tax" name="tax_rate" type="number" min={0} max={100} step="0.01" className="input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /><span className="hint">Use 0 unless your CA has confirmed the GST rate.</span></div>
          </div>
        </div>
        <div className="card">
          <dl className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
            <dt>Subtotal</dt><dd className="num" style={{ textAlign: "right" }}>{rupees(totals.subtotal)}</dd>
            <dt>Discount</dt><dd className="num" style={{ textAlign: "right" }}>− {rupees(totals.discount)}</dd>
            <dt>Tax</dt><dd className="num" style={{ textAlign: "right" }}>{rupees(totals.tax)}</dd>
          </dl>
          <div className="divider" />
          <div className="row between"><span style={{ fontWeight: 650, fontSize: 18 }}>Total</span><span className="num" style={{ fontWeight: 700, fontSize: 28, fontFamily: "var(--font-rounded)" }}>{rupees(totals.total)}</span></div>
          <div className="mt-16">
            <Submit disabled={missingStaff || !lines.some((l) => l.key)} className="btn primary btn-lg">Save bill</Submit>
            {missingStaff && <div className="muted mt-8" style={{ fontSize: 13 }}>Pick the stylist on every line to save.</div>}
          </div>
        </div>
      </section>
    </ActionForm>
  );
}
