import Link from "next/link";
import { adjustPayrollAction, deletePayrollAction, generatePayrollAction, payrollStatusAction } from "@/app/ops-actions";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Person, Stat } from "@/components/kit";
import { requireAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { workingDays } from "@/lib/ops-calc";
import { istToday, monthKey, monthRange, parseMonth, prettyDay } from "@/lib/ops-time";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const { year, month } = parseMonth((await searchParams).month);
  const key = monthKey(year, month);
  const { from, to } = monthRange(year, month);
  const today = istToday();
  const [settings, staff, rows] = await Promise.all([db.getSettings(), db.list("staff"), db.query("staff_payroll", { eq: { year, month } })]);
  const team = new Map(staff.map((s) => [s.id, s]));
  rows.sort((a, b) => (team.get(a.staff_id)?.name ?? "").localeCompare(team.get(b.staff_id)?.name ?? ""));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const paid = rows.filter((r) => r.status === "paid");
  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  const monthLabel = prettyDay(from, { month: "long", year: "numeric" });
  const inProgress = to >= today;
  const missing = staff.filter((s) => s.status === "active" && !rows.some((r) => r.staff_id === s.id));

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Back office"
        title="Payroll"
        sub={`${monthLabel} · ${workingDays(year, month, settings.weekly_off ?? [])} working days · leave is ${settings.paid_leave ? "paid" : "unpaid"} (change in Settings → Salon hours & billing)`}
        actions={
          <>
            <Link className="btn" href={`/payroll?month=${prev}`}>← {prettyDay(`${prev}-01`, { month: "short" })}</Link>
            <form className="row" action="/payroll">
              <input type="month" name="month" defaultValue={key} className="input" aria-label="Month" style={{ width: 170 }} />
              <button className="btn" type="submit">Go</button>
            </form>
            {`${next}-01` <= today && <Link className="btn" href={`/payroll?month=${next}`}>{prettyDay(`${next}-01`, { month: "short" })} →</Link>}
          </>
        }
      />

      <div className="grid g-4">
        <Stat label="Take-home for the month" value={inr(sum((r) => r.total))} delta={`${rows.length} people`} />
        <Stat label="Paid" value={inr(sum((r) => (r.status === "paid" ? r.total : 0)))} delta={`${paid.length} of ${rows.length}`} />
        <Stat label="Commission" value={inr(sum((r) => r.commission))} delta={`on ${inr(sum((r) => r.billed))} billed`} />
        <Stat label="Advances recovered" value={inr(sum((r) => r.advance))} />
      </div>

      <div className="row wrap mt-24" style={{ marginBottom: 12 }}>
        {from <= today && <ActionButton className="btn primary" action={generatePayrollAction.bind(null, year, month)}>{rows.length ? "Refresh from attendance & sales" : "Work out this month's payroll"}</ActionButton>}
        {rows.length > 0 && <a className="btn" href={`/payroll/export?month=${key}`} download>Download CSV</a>}
        {inProgress && rows.length > 0 && <span className="muted" style={{ fontSize: 13.5 }}>The month isn't over — refresh again at month end before paying.</span>}
      </div>
      {missing.length > 0 && rows.length > 0 && <div className="callout" style={{ marginBottom: 12 }}>Not in this month's payroll yet: {missing.map((s) => s.name).join(", ")}. Refresh to add them.</div>}

      <Card>
        {rows.length === 0 ? (
          <div className="empty">{from > today ? "This month hasn't started." : "No payroll for this month yet. Work it out from attendance and sales with the button above."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Person</th><th className="r">Days paid</th><th className="r">Base → earned</th><th className="r">Commission</th><th>Adjustments</th><th className="r">Take-home</th><th>Status</th><th className="sticky-end" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = team.get(r.staff_id);
                  const locked = r.status === "paid";
                  return (
                    <tr key={r.id}>
                      <td><Person name={s?.name ?? "Former staff"} sub={s?.position} /></td>
                      <td className="r num">{num(r.paid_days)} / {r.working_days}</td>
                      <td className="r num">{inr(r.base_salary)}<div className="muted" style={{ fontSize: 12.5 }}>→ {inr(r.earned_base)}</div></td>
                      <td className="r num">{inr(r.commission)}<div className="muted" style={{ fontSize: 12.5 }}>{r.commission_rate}% of {inr(r.billed)}</div></td>
                      <td className="num text-2" style={{ fontSize: 13.5 }}>
                        {r.bonus > 0 && <div style={{ color: "var(--good)" }}>+{inr(r.bonus)} bonus</div>}
                        {r.advance > 0 && <div>−{inr(r.advance)} advance</div>}
                        {r.deductions > 0 && <div>−{inr(r.deductions)} deductions</div>}
                        {!r.bonus && !r.advance && !r.deductions && <span className="muted">—</span>}
                      </td>
                      <td className="r"><b style={{ fontSize: 16 }}>{inr(r.total)}</b></td>
                      <td><Badge tone={locked ? "good" : r.status === "processing" ? "warn" : undefined}>{locked ? `Paid ${r.paid_at ? prettyDay(istToday(Date.parse(r.paid_at)), { day: "numeric", month: "short" }) : ""}` : r.status === "processing" ? "Processing" : "Pending"}</Badge></td>
                      <td className="sticky-end">
                        {!locked && (
                          <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            <details className="row-edit">
                              <summary className="btn sm">Adjust</summary>
                              <div className="row-edit-panel" style={{ width: "min(420px, 86vw)" }}>
                                <ActionForm action={adjustPayrollAction} className="stack" style={{ gap: 12 }}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <div className="grid g-3" style={{ gap: 10 }}>
                                    <div className="field"><label htmlFor={`b-${r.id}`}>Bonus ₹</label><input id={`b-${r.id}`} name="bonus" type="number" min={0} step="1" className="input" defaultValue={r.bonus} /></div>
                                    <div className="field"><label htmlFor={`a-${r.id}`}>Advance ₹</label><input id={`a-${r.id}`} name="advance" type="number" min={0} step="1" className="input" defaultValue={r.advance} /></div>
                                    <div className="field"><label htmlFor={`d-${r.id}`}>Deductions ₹</label><input id={`d-${r.id}`} name="deductions" type="number" min={0} step="1" className="input" defaultValue={r.deductions} /></div>
                                  </div>
                                  <span className="hint">Advance = money paid early this month, recovered here. Deductions = PF, ESI, professional tax or other.</span>
                                  <div className="row between">
                                    <Submit className="btn sm primary">Save</Submit>
                                    {r.status === "pending" && <ActionButton action={payrollStatusAction.bind(null, r.id, "processing")}>Mark processing</ActionButton>}
                                  </div>
                                </ActionForm>
                              </div>
                            </details>
                            <ActionButton className="btn sm primary" action={payrollStatusAction.bind(null, r.id, "paid")} confirm={`Mark ${inr(r.total)} as paid to ${s?.name ?? "this person"}? The row locks and the salary is booked under expenses.`}>Mark paid</ActionButton>
                            <ActionButton className="btn sm ghost" action={deletePayrollAction.bind(null, r.id)} confirm="Remove this payroll row?">✕</ActionButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-24 subtle" title="How take-home is worked out">
        <div className="code-block" style={{ whiteSpace: "pre-wrap" }}>{`paid days   = present + ½ × half days${settings.paid_leave ? " + leave" : ""}
earned base = base × min(1, paid days ÷ working days)
commission  = billed on issued bills × commission %
take-home   = earned base + commission + bonus − advance − deductions`}</div>
        <p className="muted mt-16" style={{ fontSize: 13.5 }}>PF, ESI and professional tax aren't calculated automatically — enter them under deductions. Check with your CA which apply. Paid rows can't be edited or deleted.</p>
      </Card>
    </>
  );
}
