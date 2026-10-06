import Link from "next/link";
import { attendanceTimesAction, clearAttendanceAction, markAttendanceAction } from "@/app/ops-actions";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Card, DemoBanner, num, PageHeader, Person, Stat } from "@/components/kit";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { workingDays } from "@/lib/ops-calc";
import { addDays, daysInMonth, isYmd, istToday, monthKey, monthRange, parseMonth, prettyDay, weekday } from "@/lib/ops-time";
import type { AttendanceStatus } from "@/lib/types";

const STATUSES: { v: AttendanceStatus; label: string; short: string }[] = [
  { v: "present", label: "Present", short: "P" },
  { v: "half_day", label: "Half day", short: "H" },
  { v: "leave", label: "Leave", short: "L" },
  { v: "absent", label: "Absent", short: "A" },
];

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; month?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const today = istToday();
  const view = sp.view === "month" ? "month" : "day";
  const date = sp.date && isYmd(sp.date) && sp.date <= today ? sp.date : today;
  const { year, month } = parseMonth(sp.month);
  const settings = await db.getSettings();
  const staff = (await db.list("staff")).sort((a, b) => a.name.localeCompare(b.name));

  if (view === "month") {
    const { from, to } = monthRange(year, month);
    const rows = await db.query("staff_attendance", { gte: { date: from }, lte: { date: to } });
    const cell = new Map(rows.map((r) => [`${r.staff_id}|${r.date}`, r.status]));
    const n = daysInMonth(year, month);
    const days = Array.from({ length: n }, (_, i) => `${monthKey(year, month)}-${String(i + 1).padStart(2, "0")}`);
    const off = settings.weekly_off ?? [];
    const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
    const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
    const shown = staff.filter((s) => s.status === "active" || rows.some((r) => r.staff_id === s.id));
    return (
      <>
        <DemoBanner demo={db.isDemo()} />
        <PageHeader eyebrow="Front desk" title="Attendance" sub={`${prettyDay(from, { month: "long", year: "numeric" })} · ${workingDays(year, month, off)} working days`} actions={<Tabs view="month" />} />
        <Card
          title="Month at a glance"
          sub="P present · H half day · L leave · A absent · grey = salon closed"
          action={
            <div className="row">
              <Link className="btn sm" href={`/attendance?view=month&month=${prev}`}>← {prettyDay(`${prev}-01`, { month: "short" })}</Link>
              {to < today && <Link className="btn sm" href={`/attendance?view=month&month=${next}`}>{prettyDay(`${next}-01`, { month: "short" })} →</Link>}
            </div>
          }
        >
          <div className="table-wrap">
            <table className="tbl att-grid">
              <thead>
                <tr>
                  <th>Staff</th>
                  {days.map((d) => <th key={d} className={off.includes(weekday(d)) ? "off" : ""} title={prettyDay(d, { weekday: "long", day: "numeric", month: "short" })}>{Number(d.slice(8))}</th>)}
                  <th className="r">P</th><th className="r">H</th><th className="r">L</th><th className="r">A</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const count = (st: AttendanceStatus) => days.filter((d) => cell.get(`${s.id}|${d}`) === st).length;
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{s.name}</td>
                      {days.map((d) => {
                        const st = cell.get(`${s.id}|${d}`);
                        return <td key={d} className={`att ${st ?? ""} ${off.includes(weekday(d)) ? "off" : ""}`}>{st ? STATUSES.find((x) => x.v === st)?.short : d <= today && !off.includes(weekday(d)) ? "·" : ""}</td>;
                      })}
                      <td className="r"><b>{count("present")}</b></td><td className="r">{count("half_day")}</td><td className="r">{count("leave")}</td><td className="r">{count("absent")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    );
  }

  const rows = await db.query("staff_attendance", { eq: { date } });
  const byStaff = new Map(rows.map((r) => [r.staff_id, r]));
  const active = staff.filter((s) => s.status === "active" || byStaff.has(s.id));
  const closed = (settings.weekly_off ?? []).includes(weekday(date));
  const count = (st: AttendanceStatus) => rows.filter((r) => r.status === st).length;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Front desk"
        title="Attendance"
        sub={`${prettyDay(date, { weekday: "long", day: "numeric", month: "long" })}${date === today ? " · today" : ""}${closed ? " · salon closed (marking still allowed for extra days)" : ""}`}
        actions={
          <>
            <Tabs view="day" />
            <Link className="btn" href={`/attendance?date=${addDays(date, -1)}`}>← Prev</Link>
            <form className="row" action="/attendance">
              <input type="date" name="date" defaultValue={date} max={today} className="input" aria-label="Date" style={{ width: 170 }} />
              <button className="btn" type="submit">Go</button>
            </form>
            {date < today && <Link className="btn" href={`/attendance?date=${addDays(date, 1)}`}>Next →</Link>}
          </>
        }
      />
      <div className="grid g-4">
        <Stat label="Present" value={num(count("present"))} delta={count("half_day") ? `+ ${count("half_day")} half day` : undefined} />
        <Stat label="On leave" value={num(count("leave"))} />
        <Stat label="Absent" value={num(count("absent"))} />
        <Stat label="Not marked yet" value={num(active.filter((s) => !byStaff.has(s.id)).length)} tone={active.some((s) => !byStaff.has(s.id)) ? "down" : undefined} delta="one tap per person below" />
      </div>
      <Card className="mt-24" title="Mark the team" sub="Tap a status; tap another to change it. Times are optional.">
        {active.length === 0 ? (
          <div className="empty">No staff yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Status</th><th>Check-in / out</th><th /></tr></thead>
              <tbody>
                {active.map((s) => {
                  const r = byStaff.get(s.id);
                  const working = r?.status === "present" || r?.status === "half_day";
                  return (
                    <tr key={s.id}>
                      <td><Person name={s.name} sub={s.position} /></td>
                      <td>
                        <div className="row wrap" style={{ gap: 6 }} role="group" aria-label={`${s.name} attendance`}>
                          {STATUSES.map((st) => (
                            <ActionButton key={st.v} className={`chip${r?.status === st.v ? ` on att-${st.v}` : ""}`} action={markAttendanceAction.bind(null, s.id, date, st.v)}>
                              {st.label}
                            </ActionButton>
                          ))}
                        </div>
                      </td>
                      <td>
                        {working ? (
                          <ActionForm action={attendanceTimesAction} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="staff_id" value={s.id} />
                            <input type="hidden" name="date" value={date} />
                            <input type="hidden" name="status" value={r.status} />
                            <input type="time" name="check_in" className="input" defaultValue={r.check_in ?? ""} aria-label="Check-in" style={{ width: 120 }} />
                            <input type="time" name="check_out" className="input" defaultValue={r.check_out ?? ""} aria-label="Check-out" style={{ width: 120 }} />
                            <Submit className="btn sm">Save</Submit>
                          </ActionForm>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="r">{r && <ActionButton className="btn sm ghost" action={clearAttendanceAction.bind(null, s.id, date)} confirm={`Clear ${s.name}'s attendance for this day?`}>Clear</ActionButton>}</td>
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

function Tabs({ view }: { view: "day" | "month" }) {
  return (
    <div className="tabs">
      <Link href="/attendance" className={view === "day" ? "on" : ""}>Day</Link>
      <Link href="/attendance?view=month" className={view === "month" ? "on" : ""}>Month</Link>
    </div>
  );
}
