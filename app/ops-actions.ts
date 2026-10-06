"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction, requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { userMessage } from "@/lib/errors";
import * as ops from "@/lib/ops";
import { isHm, prettyDay, time12 } from "@/lib/ops-time";
import type { AppointmentStatus, AttendanceStatus, Invoice, PaymentMethod, Payroll, StockMovement } from "@/lib/types";
import type { ActionState } from "./actions";

// Server actions for salon operations. Every one re-checks the session; owner-only ones re-read the
// role from the database (requireAdminAction), so hiding a button is never the only protection.

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

async function run(fn: (actor: string) => Promise<string>, opts: { admin?: boolean } = {}): Promise<ActionState> {
  const me = await requireManager(); // redirects to /login when signed out (outside the try on purpose)
  try {
    if (opts.admin) await requireAdminAction();
    const message = await fn(me.name);
    refresh();
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: userMessage(e) };
  }
}

// ---------- Appointments ----------

export async function bookAppointmentAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const r = await ops.bookAppointment(
      {
        name: s(f, "name"),
        phone: s(f, "phone"),
        email: s(f, "email") || null,
        whatsappOptIn: f.get("whatsapp_opt_in") === "on",
        service_id: s(f, "service_id"),
        staff_id: s(f, "staff_id"),
        date: s(f, "date"),
        time: s(f, "time"),
        notes: s(f, "notes"),
      },
      actor,
    );
    return `Booked ${r.customer.name} with ${r.staff.name.split(" ")[0]} · ${prettyDay(r.appointment.date, { weekday: "short", day: "numeric", month: "short" })}, ${time12(r.appointment.time)}${r.created ? " · new member added" : ""}`;
  });
}

export async function appointmentStatusAction(id: string, status: AppointmentStatus): Promise<ActionState> {
  return run(async (actor) => {
    const a = await ops.setAppointmentStatus(id, status, actor);
    return `${a.service_name} · ${ops.STATUS_LABEL[status]}`;
  });
}

// ---------- Invoices ----------

export async function createInvoiceAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireManager();
  let id = "";
  try {
    let lines: ops.InvoiceLineInput[];
    try {
      lines = JSON.parse(s(f, "lines") || "[]");
      if (!Array.isArray(lines)) throw new Error();
    } catch {
      return { ok: false, message: "The bill lines couldn't be read — refresh the page and try again" };
    }
    const r = await ops.createInvoice(
      {
        client_name: s(f, "client_name"),
        client_phone: s(f, "client_phone"),
        client_address: s(f, "client_address") || null,
        whatsapp_opt_in: f.get("whatsapp_opt_in") === "on",
        invoice_date: s(f, "invoice_date"),
        appointment_id: s(f, "appointment_id") || null,
        lines: lines.slice(0, 51).map((l) => ({
          item_type: l?.item_type === "inventory" ? "inventory" : "service",
          ref_id: String(l?.ref_id ?? ""),
          description: String(l?.description ?? ""),
          quantity: Number(l?.quantity),
          rate: Number(l?.rate),
          staff_id: String(l?.staff_id ?? ""),
        })),
        discount: Number(s(f, "discount") || 0),
        tax_rate: Number(s(f, "tax_rate") || 0),
        payment_method: s(f, "payment_method") as PaymentMethod,
        payment_status: s(f, "payment_status") as Invoice["payment_status"],
        amount_paid: Number(s(f, "amount_paid") || 0),
      },
      me.name,
    );
    id = r.invoice.id;
    refresh();
  } catch (e) {
    return { ok: false, message: userMessage(e) };
  }
  redirect(`/invoices/${id}?created=1`);
}

export async function voidInvoiceAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const inv = await ops.voidInvoice(s(f, "id"), s(f, "reason"), actor);
    return `${inv.invoice_no} is void. Stock returned${inv.loyalty_points ? ` and ${inv.loyalty_points} points taken back` : ""}.`;
  }, { admin: true });
}

export async function paymentAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const inv = await ops.updatePayment(s(f, "id"), s(f, "payment_method") as PaymentMethod, s(f, "payment_status") as Invoice["payment_status"], s(f, "amount_paid"), actor);
    return `${inv.invoice_no}: ${inv.payment_status === "paid" ? "fully paid" : inv.payment_status === "partial" ? `₹${inv.amount_paid.toLocaleString("en-IN")} received` : "marked unpaid"}`;
  });
}

// ---------- Staff ----------

const staffInput = (f: FormData) => ({ name: s(f, "name"), phone: s(f, "phone"), email: s(f, "email"), position: s(f, "position"), base_salary: s(f, "base_salary"), commission_rate: s(f, "commission_rate") });

export async function saveStaffAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const id = s(f, "id");
    const row = id ? await ops.updateStaff(id, staffInput(f), actor) : await ops.createStaff(staffInput(f), actor);
    return id ? `Saved ${row.name}` : `${row.name} added to the team`;
  }, { admin: true });
}

export async function staffStatusAction(id: string, active: boolean): Promise<ActionState> {
  return run(async (actor) => {
    const st = await ops.setStaffStatus(id, active ? "active" : "inactive", actor);
    return active ? `${st.name} is active again` : `${st.name} is inactive — hidden from bookings and bills`;
  }, { admin: true });
}

export async function deleteStaffAction(id: string): Promise<ActionState> {
  return run(async (actor) => `Removed ${(await ops.deleteStaff(id, actor)).name}`, { admin: true });
}

// ---------- Attendance ----------

export async function markAttendanceAction(staffId: string, date: string, status: AttendanceStatus): Promise<ActionState> {
  return run(async (actor) => {
    const { staff } = await ops.markAttendance({ staff_id: staffId, date, status }, actor);
    return `${staff.name.split(" ")[0]}: ${status.replace("_", " ")}`;
  });
}

export async function attendanceTimesAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const checkIn = s(f, "check_in");
    const checkOut = s(f, "check_out");
    for (const t of [checkIn, checkOut]) if (t && !isHm(t)) throw new Error("Times must look like 09:45");
    const { staff } = await ops.markAttendance({ staff_id: s(f, "staff_id"), date: s(f, "date"), status: s(f, "status") as AttendanceStatus, check_in: checkIn || null, check_out: checkOut || null }, actor);
    return `Saved ${staff.name.split(" ")[0]}'s times`;
  });
}

export async function clearAttendanceAction(staffId: string, date: string): Promise<ActionState> {
  return run(async (actor) => {
    await ops.clearAttendance(staffId, date, actor);
    return "Cleared";
  });
}

// ---------- Payroll ----------

export async function generatePayrollAction(year: number, month: number): Promise<ActionState> {
  return run(async (actor) => {
    const r = await ops.generatePayroll(year, month, actor);
    return `Payroll worked out: ${r.created} new, ${r.refreshed} refreshed${r.locked ? `, ${r.locked} already paid (left as is)` : ""}`;
  }, { admin: true });
}

export async function adjustPayrollAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const p = await ops.adjustPayroll(s(f, "id"), { bonus: s(f, "bonus"), advance: s(f, "advance"), deductions: s(f, "deductions") }, actor);
    return `Saved · take-home ₹${p.total.toLocaleString("en-IN")}`;
  }, { admin: true });
}

export async function payrollStatusAction(id: string, status: Payroll["status"]): Promise<ActionState> {
  return run(async (actor) => {
    await ops.setPayrollStatus(id, status, actor);
    return status === "paid" ? "Marked paid · locked and booked under Salaries" : `Marked ${status}`;
  }, { admin: true });
}

export async function deletePayrollAction(id: string): Promise<ActionState> {
  return run(async (actor) => {
    await ops.deletePayroll(id, actor);
    return "Payroll row removed";
  }, { admin: true });
}

// ---------- Expenses ----------

export async function saveExpenseAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const e = await ops.saveExpense({ id: s(f, "id") || undefined, date: s(f, "date"), name: s(f, "name"), category: s(f, "category"), amount: s(f, "amount"), note: s(f, "note") }, actor);
    return `${s(f, "id") ? "Updated" : "Recorded"} ${e.name} · ₹${e.amount.toLocaleString("en-IN")}`;
  }, { admin: true });
}

export async function deleteExpenseAction(id: string): Promise<ActionState> {
  return run(async (actor) => `Deleted ${(await ops.deleteExpense(id, actor)).name}`, { admin: true });
}

// ---------- Catalogue ----------

export async function saveServiceAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const svc = await ops.saveService({ id: s(f, "id") || undefined, name: s(f, "name"), category: s(f, "category"), gender: s(f, "gender"), price: s(f, "price"), duration_min: s(f, "duration_min"), points: s(f, "points"), revisit_days: s(f, "revisit_days") }, actor);
    return `${s(f, "id") ? "Saved" : "Added"} ${svc.name}`;
  }, { admin: true });
}

export async function serviceActiveAction(id: string, active: boolean): Promise<ActionState> {
  return run(async (actor) => {
    const svc = await ops.setServiceActive(id, active, actor);
    return active ? `${svc.name} is back on the menu` : `${svc.name} retired — kept for history, hidden from new bookings and bills`;
  }, { admin: true });
}

export async function saveProductAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const p = await ops.saveProduct({ id: s(f, "id") || undefined, name: s(f, "name"), category: s(f, "category"), price: s(f, "price"), reorder_level: s(f, "reorder_level"), quantity: s(f, "quantity"), description: s(f, "description") }, actor);
    return `${s(f, "id") ? "Saved" : "Added"} ${p.name}`;
  }, { admin: true });
}

export async function adjustStockAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async (actor) => {
    const r = await ops.adjustStock(s(f, "id"), s(f, "delta"), s(f, "reason") as StockMovement["reason"], s(f, "note"), actor);
    return `${r.item.name}: ${r.after} in stock`;
  }, { admin: true });
}

// ---------- Operations settings ----------

export async function saveOpsSettingsAction(_: ActionState, f: FormData): Promise<ActionState> {
  return run(async () => {
    const open = s(f, "opening_time");
    const close = s(f, "closing_time");
    if (!isHm(open) || !isHm(close)) throw new Error("Opening and closing times must look like 10:00");
    if (close <= open) throw new Error("Closing time must be after opening time");
    const slot = Number(s(f, "slot_minutes") || 15);
    if (![10, 15, 20, 30, 60].includes(slot)) throw new Error("Booking grid must be 10, 15, 20, 30 or 60 minutes");
    const prefix = s(f, "invoice_prefix").toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(prefix)) throw new Error("Invoice prefix: 1–6 letters or numbers, e.g. INV");
    const gstin = s(f, "gstin").toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new Error("That GSTIN doesn't look right (15 characters, e.g. 36ABCDE1234F1Z5) — or leave it empty");
    await db.update("settings", "default", {
      salon_address: s(f, "salon_address").slice(0, 200),
      salon_phone: s(f, "salon_phone").slice(0, 40),
      gstin,
      invoice_prefix: prefix,
      opening_time: open,
      closing_time: close,
      slot_minutes: slot,
      weekly_off: f.getAll("weekly_off").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      paid_leave: f.get("paid_leave") === "on",
    });
    return "Salon hours and billing saved";
  }, { admin: true });
}

// ---------- Lookups ----------

/** Phone → member, for autofilling the bill. Returns only what the counter needs to see. */
export async function findMemberAction(phone: string): Promise<{ name: string; points: number; visits: number } | null> {
  await requireManager();
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const p = digits.length === 10 ? `91${digits}` : digits;
  const c = (await db.query("customers", { eq: { phone: p }, limit: 1 }))[0];
  return c ? { name: c.name, points: c.points, visits: c.visit_count } : null;
}
