import Link from "next/link";
import { deleteExpenseAction, saveExpenseAction } from "@/app/ops-actions";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Card, DemoBanner, inr, num, PageHeader, Person, Stat } from "@/components/kit";
import { requireAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { appointmentStats, moneyFor, staffSales } from "@/lib/ops";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/ops-calc";
import { istToday, periodRange, prettyDay } from "@/lib/ops-time";
import type { Expense } from "@/lib/types";

const PERIODS = [
  { v: "today", label: "Today" },
  { v: "week", label: "This week" },
  { v: "month", label: "This month" },
  { v: "ytd", label: "Year to date" },
  { v: "fy", label: "This FY" },
];

function delta(now: number, before: number, invert = false) {
  if (!before) return { text: "no earlier data", tone: undefined };
  const d = ((now - before) / Math.abs(before)) * 100;
  const good = invert ? d <= 0 : d >= 0;
  return { text: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}% vs previous period`, tone: good ? ("up" as const) : ("down" as const) };
}

function ExpenseFields({ e }: { e?: Expense }) {
  const p = e?.id ?? "new";
  return (
    <>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor={`ex-d-${p}`}>Date paid</label><input id={`ex-d-${p}`} name="date" type="date" className="input" required max={istToday()} defaultValue={e?.date ?? istToday()} /></div>
        <div className="field"><label htmlFor={`ex-a-${p}`}>Amount ₹</label><input id={`ex-a-${p}`} name="amount" type="number" min={1} step="0.01" className="input" required defaultValue={e?.amount} /></div>
        <div className="field"><label htmlFor={`ex-n-${p}`}>What for</label><input id={`ex-n-${p}`} name="name" className="input" required maxLength={120} defaultValue={e?.name} placeholder="Electricity bill" /></div>
        <div className="field">
          <label htmlFor={`ex-c-${p}`}>Category</label>
          <select id={`ex-c-${p}`} name="category" className="select" defaultValue={e?.category ?? "Other"}>{[...new Set([...EXPENSE_CATEGORIES, ...(e ? [e.category] : [])])].map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <div className="field"><label htmlFor={`ex-x-${p}`}>Note (optional)</label><input id={`ex-x-${p}`} name="note" className="input" maxLength={300} defaultValue={e?.note ?? ""} /></div>
    </>
  );
}

export default async function Finance({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const r = periodRange(sp.period ?? "month", sp.from, sp.to);
  const [settings, now, before, sales, appts, staff] = await Promise.all([db.getSettings(), moneyFor(r.from, r.to), moneyFor(r.prevFrom, r.prevTo), staffSales(r.from, r.to), appointmentStats(r.from, r.to), db.list("staff")]);
  const team = new Map(staff.map((s) => [s.id, s]));
  const leaders = [...sales].sort((a, b) => b[1].billed - a[1].billed);
  const topBilled = Math.max(1, ...leaders.map(([, v]) => v.billed));
  const topCat = Math.max(1, ...now.byCategory.map(([, v]) => v));
  const goal = settings.margin_goal_pct;
  const label = r.from === r.to ? prettyDay(r.from) : `${prettyDay(r.from, { day: "numeric", month: "short" })} – ${prettyDay(r.to)}`;
  const marginTone = now.margin === null ? undefined : now.margin >= goal ? "up" : "down";

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader eyebrow="Back office" title="Finance" sub={`${label} · revenue from issued bills by bill date, expenses by the date they were paid`} />

      <div className="row wrap between" style={{ marginBottom: 20 }}>
        <div className="tabs">{PERIODS.map((p) => <Link key={p.v} href={`/finance?period=${p.v}`} className={r.period === p.v ? "on" : ""}>{p.label}</Link>)}</div>
        <form className="row wrap" action="/finance">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" defaultValue={r.from} className="input" aria-label="From" style={{ width: 160 }} />
          <input type="date" name="to" defaultValue={r.to} className="input" aria-label="To" style={{ width: 160 }} />
          <button className="btn" type="submit">Apply</button>
        </form>
      </div>

      <div className="grid g-4">
        <Stat label="Revenue" value={inr(now.revenue)} delta={delta(now.revenue, before.revenue).text} tone={delta(now.revenue, before.revenue).tone} />
        <Stat label="Expenses" value={inr(now.expenses)} delta={delta(now.expenses, before.expenses, true).text} tone={delta(now.expenses, before.expenses, true).tone} />
        <Stat label="Profit" value={inr(now.profit)} delta={delta(now.profit, before.profit).text} tone={now.profit < 0 ? "down" : delta(now.profit, before.profit).tone} />
        <Stat label="Margin" value={now.margin === null ? "—" : `${now.margin.toFixed(1)}%`} delta={now.margin === null ? "no revenue yet" : now.margin >= goal ? `at or above your ${goal}% goal` : `below your ${goal}% goal`} tone={marginTone} />
      </div>
      <div className="grid g-4 mt-16">
        <Stat label="Bills" value={num(now.bills)} delta={`avg ${inr(now.avgBill)}${now.voided ? ` · ${now.voided} void` : ""}`} />
        <Stat label="Collected" value={inr(now.collected)} delta={now.outstanding > 0 ? `${inr(now.outstanding)} still to collect` : "nothing outstanding"} tone={now.outstanding > 0 ? "down" : undefined} />
        <Stat label="Discounts given" value={inr(now.discounts)} delta={now.tax ? `tax collected ${inr(now.tax)}` : undefined} />
        <Stat label="Appointments" value={num(appts.total)} delta={`${appts.completed} done · ${appts.noShowRate.toFixed(0)}% no-show`} />
      </div>

      <div className="grid g-2 mt-24">
        <Card title="Top stylists" sub="Billed on issued bills">
          {leaders.length === 0 ? <div className="empty">No bills in this period.</div> : (
            <div className="list">
              {leaders.map(([id, v]) => (
                <div className="list-item" key={id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Person name={team.get(id)?.name ?? "Former staff"} sub={`${v.services} services · ${v.products} products · ${v.bills} bills`} />
                    <div className="bar mt-8"><i style={{ width: `${(v.billed / topBilled) * 100}%` }} /></div>
                  </div>
                  <b className="num">{inr(v.billed)}</b>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="Where the money went">
            {now.byCategory.length === 0 ? <div className="empty">No expenses in this period.</div> : (
              <div className="list">
                {now.byCategory.map(([c, v]) => (
                  <div key={c} className="list-item" style={{ display: "block" }}>
                    <div className="row between"><span>{c}</span><b className="num">{inr(v)}</b></div>
                    <div className="bar mt-8"><i style={{ width: `${(v / topCat) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="How guests paid">
            {now.byMethod.length === 0 ? <div className="empty">No payments yet.</div> : (
              <div className="row wrap" style={{ gap: 10 }}>
                {now.byMethod.map(([m, v]) => <div key={m} className="pill-stat" style={{ flex: "1 1 120px" }}><span className="v">{inr(v)}</span><span className="l">{PAYMENT_METHODS[m as keyof typeof PAYMENT_METHODS] ?? m}</span></div>)}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid g-main mt-24">
        <Card title="Expenses" sub={`${now.expenseRows.length} in this period · salaries are added automatically when payroll is marked paid`}>
          {now.expenseRows.length === 0 ? <div className="empty">Nothing recorded for this period.</div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Date</th><th>What for</th><th>Category</th><th className="r">Amount</th><th className="sticky-end" /></tr></thead>
                <tbody>
                  {now.expenseRows.map((e) => (
                    <tr key={e.id}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{prettyDay(e.date, { day: "numeric", month: "short" })}</td>
                      <td>{e.name}{e.note && <div className="muted" style={{ fontSize: 12.5 }}>{e.note}</div>}</td>
                      <td>{e.category}</td>
                      <td className="r"><b>{inr(e.amount)}</b></td>
                      <td className="sticky-end">
                        <details className="row-edit">
                          <summary className="btn sm">Edit</summary>
                          <div className="row-edit-panel">
                            <ActionForm action={saveExpenseAction} className="stack" style={{ gap: 12 }}>
                              <ExpenseFields e={e} />
                              <div className="row between">
                                <Submit className="btn sm primary">Save</Submit>
                                <ActionButton className="btn sm ghost" action={deleteExpenseAction.bind(null, e.id)} confirm={`Delete “${e.name}” (${inr(e.amount)})? This is logged.`}>Delete</ActionButton>
                              </div>
                            </ActionForm>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card id="add" title="Record an expense">
          <ActionForm action={saveExpenseAction} resetOnSuccess className="stack" style={{ gap: 12 }}>
            <ExpenseFields />
            <Submit>Record</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
