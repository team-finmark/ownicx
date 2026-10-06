import { saveOpsSettingsAction } from "@/app/ops-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, DemoBanner, PageHeader } from "@/components/kit";
import { requireAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { financialYear, istToday } from "@/lib/ops-time";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function OperationsSettings() {
  await requireAdmin();
  const s = await db.getSettings();
  const off = s.weekly_off ?? [];
  const prefix = s.invoice_prefix || "INV";
  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader eyebrow="Settings" title="Salon hours & billing" sub="Opening hours drive the booking grid; these details print on every bill." />
      <ActionForm action={saveOpsSettingsAction} className="grid g-2">
        <Card title="Opening hours">
          <div className="stack" style={{ gap: 12 }}>
            <div className="grid g-3" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="os-o">Opens</label><input id="os-o" name="opening_time" type="time" className="input" required defaultValue={s.opening_time ?? "10:00"} /></div>
              <div className="field"><label htmlFor="os-c">Closes</label><input id="os-c" name="closing_time" type="time" className="input" required defaultValue={s.closing_time ?? "21:00"} /></div>
              <div className="field">
                <label htmlFor="os-s">Booking every</label>
                <select id="os-s" name="slot_minutes" className="select" defaultValue={String(s.slot_minutes ?? 15)}>{[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
              </div>
            </div>
            <fieldset className="field">
              <legend className="lbl">Closed on (weekly off)</legend>
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                {DAYS.map((d, i) => (
                  <label key={d} className="chip" style={{ fontWeight: 500 }}>
                    <input type="checkbox" name="weekly_off" value={i} defaultChecked={off.includes(i)} /> {d.slice(0, 3)}
                  </label>
                ))}
              </div>
              <span className="hint">Bookings can't be made on these days, and payroll doesn't count them as working days.</span>
            </fieldset>
            <label className="row" style={{ gap: 8, fontSize: 14.5 }}>
              <input type="checkbox" name="paid_leave" defaultChecked={!!s.paid_leave} /> Leave counts as a paid day in payroll
            </label>
          </div>
        </Card>
        <Card title="On the bill">
          <div className="stack" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="os-a">Salon address</label><input id="os-a" name="salon_address" className="input" maxLength={200} defaultValue={s.salon_address ?? ""} /></div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="os-p">Phone</label><input id="os-p" name="salon_phone" className="input" maxLength={40} defaultValue={s.salon_phone ?? ""} /></div>
              <div className="field"><label htmlFor="os-g">GSTIN (if registered)</label><input id="os-g" name="gstin" className="input mono" maxLength={15} defaultValue={s.gstin ?? ""} style={{ textTransform: "uppercase" }} /></div>
            </div>
            <div className="field">
              <label htmlFor="os-x">Invoice number prefix</label>
              <input id="os-x" name="invoice_prefix" className="input mono" required maxLength={6} defaultValue={prefix} style={{ textTransform: "uppercase" }} />
              <span className="hint">Numbers run consecutively per financial year: next ones look like <b className="mono">{prefix}{financialYear(istToday())}-00001</b>. Confirm the format with your CA before going live — changing it mid-year is awkward.</span>
            </div>
          </div>
        </Card>
        <div><Submit>Save</Submit></div>
      </ActionForm>
    </>
  );
}
