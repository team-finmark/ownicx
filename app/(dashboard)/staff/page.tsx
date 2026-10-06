import Link from "next/link";
import { deleteStaffAction, saveStaffAction, staffStatusAction } from "@/app/ops-actions";
import { ActionButton, ActionForm, LiveSwitch, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Person, Stat } from "@/components/kit";
import { requireAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { staffSales } from "@/lib/ops";
import { STAFF_POSITIONS } from "@/lib/ops-calc";
import { periodRange, prettyDay } from "@/lib/ops-time";
import type { Staff } from "@/lib/types";

const PERIODS = [
  { v: "today", label: "Today" },
  { v: "week", label: "This week" },
  { v: "month", label: "This month" },
  { v: "fy", label: "This FY" },
];

function StaffFields({ s }: { s?: Staff }) {
  const p = s?.id ?? "new";
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor={`sf-n-${p}`}>Name</label><input id={`sf-n-${p}`} name="name" className="input" required defaultValue={s?.name} maxLength={80} /></div>
        <div className="field">
          <label htmlFor={`sf-p-${p}`}>Position</label>
          <input id={`sf-p-${p}`} name="position" className="input" required defaultValue={s?.position} list="positions" maxLength={60} />
        </div>
        <div className="field"><label htmlFor={`sf-ph-${p}`}>Mobile (optional)</label><input id={`sf-ph-${p}`} name="phone" className="input" inputMode="tel" defaultValue={s?.phone ?? ""} /></div>
        <div className="field"><label htmlFor={`sf-e-${p}`}>Email (optional)</label><input id={`sf-e-${p}`} name="email" type="email" className="input" defaultValue={s?.email ?? ""} /></div>
        <div className="field"><label htmlFor={`sf-b-${p}`}>Monthly base ₹</label><input id={`sf-b-${p}`} name="base_salary" type="number" min={0} step="1" className="input" required defaultValue={s?.base_salary ?? ""} /></div>
        <div className="field"><label htmlFor={`sf-c-${p}`}>Commission % of billed</label><input id={`sf-c-${p}`} name="commission_rate" type="number" min={0} max={100} step="0.5" className="input" defaultValue={s?.commission_rate ?? 0} /></div>
      </div>
    </>
  );
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = periodRange(sp.period ?? "month", sp.from, sp.to);
  const [staff, sales, prevSales] = await Promise.all([db.list("staff"), staffSales(range.from, range.to), staffSales(range.prevFrom, range.prevTo)]);
  const ordered = [...staff].sort((a, b) => (a.status === b.status ? (sales.get(b.id)?.billed ?? 0) - (sales.get(a.id)?.billed ?? 0) : a.status === "active" ? -1 : 1));
  const total = [...sales.values()].reduce((a, s) => a + s.billed, 0);
  const prevTotal = [...prevSales.values()].reduce((a, s) => a + s.billed, 0);
  const top = Math.max(1, ...[...sales.values()].map((s) => s.billed));
  const commission = staff.reduce((a, s) => a + ((sales.get(s.id)?.billed ?? 0) * s.commission_rate) / 100, 0);
  const growth = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const label = range.from === range.to ? prettyDay(range.from) : `${prettyDay(range.from, { day: "numeric", month: "short" })} – ${prettyDay(range.to)}`;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <datalist id="positions">{STAFF_POSITIONS.map((p) => <option key={p} value={p} />)}</datalist>
      <PageHeader eyebrow="Back office" title="Staff & performance" sub={`What each person billed (issued bills only) · ${label}`} />

      <div className="row wrap between" style={{ marginBottom: 20 }}>
        <div className="tabs">
          {PERIODS.map((p) => <Link key={p.v} href={`/staff?period=${p.v}`} className={range.period === p.v ? "on" : ""}>{p.label}</Link>)}
        </div>
        <form className="row wrap" action="/staff">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" defaultValue={range.from} className="input" aria-label="From" style={{ width: 160 }} />
          <input type="date" name="to" defaultValue={range.to} className="input" aria-label="To" style={{ width: 160 }} />
          <button className="btn" type="submit">Apply</button>
        </form>
      </div>

      <div className="grid g-4">
        <Stat label="Billed by the team" value={inr(total)} delta={growth === null ? "no earlier data" : `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth).toFixed(0)}% vs previous ${range.days} day${range.days === 1 ? "" : "s"}`} tone={growth === null ? undefined : growth >= 0 ? "up" : "down"} />
        <Stat label="Services done" value={num([...sales.values()].reduce((a, s) => a + s.services, 0))} />
        <Stat label="Products sold" value={num([...sales.values()].reduce((a, s) => a + s.products, 0))} delta={inr([...sales.values()].reduce((a, s) => a + s.productSales, 0))} />
        <Stat label="Commission earned" value={inr(commission)} delta="at each person's rate" />
      </div>

      <Card className="mt-24" title="Team">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Person</th><th style={{ minWidth: 200 }}>Billed</th><th>Work done</th><th className="r">Commission</th><th className="r">Base / month</th><th>Active</th><th className="sticky-end" /></tr></thead>
            <tbody>
              {ordered.map((s) => {
                const r = sales.get(s.id);
                return (
                  <tr key={s.id} style={{ opacity: s.status === "active" ? 1 : 0.55 }}>
                    <td><Person name={s.name} sub={s.position} /></td>
                    <td>
                      <div className="row between"><b>{inr(r?.billed ?? 0)}</b><span className="muted" style={{ fontSize: 12.5 }}>{total ? `${(((r?.billed ?? 0) / total) * 100).toFixed(0)}%` : ""}</span></div>
                      <div className="bar mt-8"><i style={{ width: `${((r?.billed ?? 0) / top) * 100}%` }} /></div>
                    </td>
                    <td className="text-2" style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{r?.bills ?? 0} bills<div className="muted">{r?.services ?? 0} services · {r?.products ?? 0} products</div></td>
                    <td className="r">{inr(((r?.billed ?? 0) * s.commission_rate) / 100)}<div className="muted" style={{ fontSize: 12 }}>{s.commission_rate}%</div></td>
                    <td className="r">{inr(s.base_salary)}</td>
                    <td><LiveSwitch checked={s.status === "active"} label={`${s.name} active`} onToggle={staffStatusAction.bind(null, s.id)} /></td>
                    <td className="sticky-end">
                      <details className="row-edit">
                        <summary className="btn sm">Edit</summary>
                        <div className="row-edit-panel">
                          <ActionForm action={saveStaffAction} className="stack" style={{ gap: 12 }}>
                            <StaffFields s={s} />
                            <div className="row between">
                              <Submit className="btn sm primary">Save</Submit>
                              <ActionButton className="btn sm ghost" action={deleteStaffAction.bind(null, s.id)} confirm={`Remove ${s.name}? Only possible if they have no bills, bookings, attendance or payroll.`}>Remove</ActionButton>
                            </div>
                          </ActionForm>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ordered.length === 0 && <div className="empty">No staff yet — add your team below.</div>}
      </Card>

      <div className="grid g-2 mt-24">
        <Card title="Add a team member">
          <ActionForm action={saveStaffAction} resetOnSuccess className="stack" style={{ gap: 12 }}>
            <StaffFields />
            <Submit>Add</Submit>
          </ActionForm>
        </Card>
        <Card title="How sales are credited" className="subtle">
          <ul className="text-2" style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 18, listStyle: "disc" }}>
            <li>Every bill line names the person who did it, so a bill shared by two stylists credits each for their own lines.</li>
            <li>Voided bills don't count. Product sales count for whoever sold them.</li>
            <li>Commission here is an estimate at today's rate. Payroll locks in the actual figure each month.</li>
            <li>Inactive people stay on past bills and payroll but disappear from bookings and new bills. <Badge>Tip</Badge> deactivate instead of removing.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
