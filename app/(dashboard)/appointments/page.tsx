import Link from "next/link";
import { appointmentStatusAction, bookAppointmentAction } from "@/app/ops-actions";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Person, Stat } from "@/components/kit";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { appointmentStats, hm, STATUS_LABEL } from "@/lib/ops";
import { addDays, fromMinutes, isYmd, istToday, prettyDay, slots, time12, toMinutes, weekday } from "@/lib/ops-time";
import type { AppointmentStatus } from "@/lib/types";

const TONE: Record<AppointmentStatus, "good" | "warn" | "bad" | "accent" | undefined> = { upcoming: undefined, in_progress: "warn", completed: "good", cancelled: "bad", no_show: "bad" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Appointments({ searchParams }: { searchParams: Promise<{ date?: string; denied?: string }> }) {
  await requireManager();
  const sp = await searchParams;
  const today = istToday();
  const date = sp.date && isYmd(sp.date) ? sp.date : today;
  const [settings, services, staff, rows, members, last30] = await Promise.all([
    db.getSettings(),
    db.list("services"),
    db.list("staff"),
    db.query("appointments", { eq: { date }, order: { column: "time" } }),
    db.list("customers"),
    appointmentStats(addDays(today, -30), today),
  ]);
  const active = staff.filter((s) => s.status === "active");
  const stylists = active.filter((s) => !/housekeeping|reception/i.test(s.position)); // people who take bookings
  const bookable = services.filter((s) => s.is_active !== false);
  const team = new Map(staff.map((s) => [s.id, s]));
  const guests = new Map(members.map((c) => [c.id, c]));
  const closed = (settings.weekly_off ?? []).includes(weekday(date));
  const times = slots(settings.opening_time, settings.closing_time, settings.slot_minutes ?? 15);
  const live = rows.filter((r) => r.status === "upcoming" || r.status === "in_progress");
  const isPast = date < today;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      {sp.denied && (
        <div className="callout" role="alert" style={{ marginBottom: 16 }}>
          That page is for the salon owner. Ask an admin to sign in if you need it.
        </div>
      )}
      <PageHeader
        eyebrow="Front desk"
        title="Appointments"
        sub={`${prettyDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${date === today ? " · today" : ""}${closed ? " · salon closed" : ""}`}
        actions={
          <>
            <Link className="btn" href={`/appointments?date=${addDays(date, -1)}`} aria-label="Previous day">← Prev</Link>
            <form className="row" action="/appointments">
              <input type="date" name="date" defaultValue={date} className="input" aria-label="Go to date" style={{ width: 170 }} />
              <button className="btn" type="submit">Go</button>
            </form>
            <Link className="btn" href={`/appointments?date=${addDays(date, 1)}`} aria-label="Next day">Next →</Link>
            {date !== today && <Link className="btn ghost" href="/appointments">Today</Link>}
          </>
        }
      />

      <div className="grid g-4">
        <Stat label="Bookings this day" value={num(rows.filter((r) => r.status !== "cancelled").length)} delta={`${live.length} still to come or in the chair`} />
        <Stat label="Booked value" value={inr(rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show").reduce((a, r) => a + r.service_price, 0))} delta="at menu prices" />
        <Stat label="Completed" value={num(rows.filter((r) => r.status === "completed").length)} delta={`${rows.filter((r) => r.status === "completed" && !r.invoice_id).length} not billed yet`} tone={rows.some((r) => r.status === "completed" && !r.invoice_id) ? "down" : undefined} />
        <Stat label="No-show rate · 30 days" value={`${last30.noShowRate.toFixed(0)}%`} delta={`${last30.noShow} no-show(s), ${last30.cancelled} cancelled`} />
      </div>

      <Card className="mt-24" title="Day schedule" sub="Mark guests in the chair, complete them, then bill">
        {rows.length === 0 ? (
          <div className="empty">{closed ? `The salon is closed on ${DAYS[weekday(date)]}s.` : "No bookings yet for this day."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Time</th><th>Guest</th><th>Service</th><th>Stylist</th><th>Status</th><th className="sticky-end" /></tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const g = guests.get(a.customer_id);
                  const t = hm(a.time);
                  return (
                    <tr key={a.id} style={{ opacity: a.status === "cancelled" || a.status === "no_show" ? 0.55 : 1 }}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <b>{time12(t)}</b>
                        <div className="muted" style={{ fontSize: 12.5 }}>to {time12(fromMinutes(toMinutes(t) + a.duration_min))}</div>
                      </td>
                      <td><Person name={g?.name ?? "Guest"} sub={g ? `+${g.phone}${a.notes ? ` · ${a.notes}` : ""}` : a.notes ?? undefined} /></td>
                      <td style={{ minWidth: 120 }}>{a.service_name}<div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{a.duration_min} min · {inr(a.service_price)}</div></td>
                      <td style={{ whiteSpace: "nowrap" }}>{team.get(a.staff_id)?.name.split(" ")[0] ?? "—"}</td>
                      <td><Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>{a.invoice_id && <div className="mt-8"><Link href={`/invoices/${a.invoice_id}`} className="muted" style={{ fontSize: 12.5, textDecoration: "underline" }}>View bill</Link></div>}</td>
                      <td className="sticky-end">
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                          {a.status === "upcoming" && !isPast && <ActionButton action={appointmentStatusAction.bind(null, a.id, "in_progress")}>In chair</ActionButton>}
                          {(a.status === "upcoming" || a.status === "in_progress") && <ActionButton action={appointmentStatusAction.bind(null, a.id, "completed")}>Done</ActionButton>}
                          {(a.status === "completed" || a.status === "in_progress") && !a.invoice_id && <Link className="btn sm primary" href={`/invoices/new?appointment=${a.id}`}>Bill</Link>}
                          {a.status === "upcoming" && <ActionButton action={appointmentStatusAction.bind(null, a.id, "no_show")} confirm="Mark this guest as a no-show?">No-show</ActionButton>}
                          {(a.status === "upcoming" || a.status === "in_progress") && <ActionButton className="btn sm ghost" action={appointmentStatusAction.bind(null, a.id, "cancelled")} confirm="Cancel this booking? The slot opens up again.">Cancel</ActionButton>}
                          {(a.status === "cancelled" || a.status === "no_show") && !isPast && <ActionButton className="btn sm ghost" action={appointmentStatusAction.bind(null, a.id, "upcoming")}>Restore</ActionButton>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid g-2 mt-24">
        <Card id="book" title="Book an appointment" sub="Existing members are found by phone. The name is only needed for a new guest.">
          {stylists.length === 0 ? (
            <div className="empty">Add your team under Staff & performance before booking.</div>
          ) : (
            <ActionForm action={bookAppointmentAction} resetOnSuccess className="stack" style={{ gap: 12 }}>
              <div className="grid g-2" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="bk-phone">Mobile</label>
                  <input id="bk-phone" name="phone" className="input" inputMode="tel" required placeholder="98765 43210" list="bk-members" autoComplete="off" />
                  <datalist id="bk-members">{members.slice(0, 2000).map((c) => <option key={c.id} value={c.phone}>{c.name}</option>)}</datalist>
                </div>
                <div className="field"><label htmlFor="bk-name">Name (new guest)</label><input id="bk-name" name="name" className="input" placeholder="Full name" /></div>
              </div>
              <div className="field">
                <label htmlFor="bk-svc">Service</label>
                <select id="bk-svc" name="service_id" className="select" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {bookable.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_min ?? 30} min · {inr(s.price)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bk-staff">Stylist</label>
                <select id="bk-staff" name="staff_id" className="select" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {stylists.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.position}</option>)}
                </select>
              </div>
              <div className="grid g-2" style={{ gap: 10 }}>
                <div className="field"><label htmlFor="bk-date">Date</label><input id="bk-date" name="date" type="date" className="input" required min={today} defaultValue={date < today ? today : date} /></div>
                <div className="field">
                  <label htmlFor="bk-time">Time</label>
                  <select id="bk-time" name="time" className="select" required defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {times.map((t) => <option key={t} value={t}>{time12(t)}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label htmlFor="bk-notes">Notes (optional)</label><input id="bk-notes" name="notes" className="input" maxLength={300} placeholder="Allergies, preferences…" /></div>
              <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" name="whatsapp_opt_in" /> New guest agrees to WhatsApp reminders and offers</label>
              <Submit>Book</Submit>
            </ActionForm>
          )}
        </Card>

        <Card title="Who's free" sub={`Booked time per stylist on ${prettyDay(date, { day: "numeric", month: "short" })}`}>
          <div className="list">
            {stylists.map((s) => {
              const mine = live.filter((r) => r.staff_id === s.id);
              return (
                <div className="list-item" key={s.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {mine.length ? mine.map((r) => `${time12(hm(r.time))}–${time12(fromMinutes(toMinutes(hm(r.time)) + r.duration_min))}`).join(" · ") : "Free all day"}
                    </div>
                  </div>
                  <Badge tone={mine.length ? undefined : "good"}>{mine.reduce((a, r) => a + r.duration_min, 0)} min</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
