import { getManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { monthKey, parseMonth, toCsv } from "@/lib/ops-time";

// CSV of one month's payroll. Lives under the dashboard (not /api), so the proxy sends signed-out
// visitors to /login; the role is checked again here against the database.
export async function GET(req: Request) {
  const me = await getManager();
  if (!me) return new Response("Sign in first", { status: 401 });
  if (me.role !== "admin") return new Response("Owner only", { status: 403 });
  const { year, month } = parseMonth(new URL(req.url).searchParams.get("month") ?? undefined);
  const [rows, staff] = await Promise.all([db.query("staff_payroll", { eq: { year, month } }), db.list("staff")]);
  const team = new Map(staff.map((s) => [s.id, s]));
  const csv = toCsv([
    ["Name", "Position", "Month", "Working days", "Paid days", "Base salary", "Earned base", "Billed", "Commission %", "Commission", "Bonus", "Advance", "Deductions", "Take-home", "Status", "Paid at"],
    ...rows
      .sort((a, b) => (team.get(a.staff_id)?.name ?? "").localeCompare(team.get(b.staff_id)?.name ?? ""))
      .map((r) => [team.get(r.staff_id)?.name ?? r.staff_id, team.get(r.staff_id)?.position ?? "", monthKey(year, month), r.working_days, r.paid_days, r.base_salary, r.earned_base, r.billed, r.commission_rate, r.commission, r.bonus, r.advance, r.deductions, r.total, r.status, r.paid_at ?? ""]),
  ]);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${monthKey(year, month)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
