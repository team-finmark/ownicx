import "server-only";
import * as db from "./db";
import { normalisePhone } from "./engine";
import { DbError } from "./errors";
import { addPoints, onboardCustomer, recordVisit } from "./loyalty";
import { billTotals, payrollFor } from "./ops-calc";
import { financialYear, fromMinutes, isHm, isYmd, istToday, monthRange, prettyDay, round2, time12, toMinutes, weekday } from "./ops-time";
import type {
  Appointment,
  AppointmentStatus,
  Attendance,
  AttendanceStatus,
  Customer,
  Expense,
  InventoryItem,
  Invoice,
  InvoiceItem,
  PaymentMethod,
  Payroll,
  Service,
  Staff,
  StockMovement,
} from "./types";

// Salon operations: bookings, billing, stock, staff, attendance, payroll and the money view.
// Every rule lives here (server-side), never in the browser. Writes that can race — stock,
// invoice numbers, payroll locks, appointment status — use compare-and-set (db.updateIf), so
// two tills can't oversell stock, reuse an invoice number or change a paid payroll row.

const now = () => new Date().toISOString();
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Append-only trail for money and stock changes. Never blocks the change it records. */
export async function audit(table: string, rowId: string, action: string, actor: string | null, detail: Record<string, unknown> = {}) {
  try {
    await db.insert("audit_log", { id: db.newId("al"), table_name: table, row_id: rowId, action, actor, detail, at: now() });
  } catch (e) {
    console.error("audit_log write failed", e);
  }
}

function money(v: unknown, label: string, max = 10_000_000) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} must be between 0 and ${max.toLocaleString("en-IN")}`);
  return round2(n);
}

// ---------- Members (clients) ----------

/** Finds the member by phone (the one identity a salon reliably has), or adds them. */
export async function findOrCreateMember(input: { name: string; phone: string; email?: string | null; whatsappOptIn?: boolean }): Promise<{ customer: Customer; created: boolean }> {
  const phone = normalisePhone(input.phone);
  if (!/^\d{10,15}$/.test(phone)) throw new Error("Enter a valid mobile number");
  const found = (await db.query("customers", { eq: { phone }, limit: 1 }))[0];
  if (found) return { customer: found, created: false };
  if (!input.name.trim()) throw new Error("New guest: enter their name");
  try {
    const customer = await onboardCustomer({ name: input.name, phone, email: input.email || null, channel: "walk_in", whatsapp_opt_in: !!input.whatsappOptIn });
    return { customer, created: true };
  } catch (e) {
    // Another till added the same number a moment ago.
    const again = (await db.query("customers", { eq: { phone }, limit: 1 }))[0];
    if (again) return { customer: again, created: false };
    throw e;
  }
}

// ---------- Appointments ----------

const ACTIVE: AppointmentStatus[] = ["upcoming", "in_progress"];
const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {
  upcoming: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["upcoming"],
  no_show: ["upcoming"],
};
export const STATUS_LABEL: Record<AppointmentStatus, string> = { upcoming: "Upcoming", in_progress: "In chair", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };

/** Postgres returns "HH:MM:SS"; the app speaks "HH:MM". */
export const hm = (t: string) => t.slice(0, 5);

/** The first active booking for this stylist that overlaps [time, time + duration). */
export async function findClash(staffId: string, date: string, time: string, duration: number, exceptId?: string) {
  const start = toMinutes(time);
  const end = start + duration;
  const same = await db.query("appointments", { eq: { staff_id: staffId, date }, in: { status: ACTIVE } });
  return same.find((a) => a.id !== exceptId && toMinutes(hm(a.time)) < end && start < toMinutes(hm(a.time)) + a.duration_min) ?? null;
}

async function checkSlot(staff: Staff, date: string, time: string, duration: number, exceptId?: string) {
  const settings = await db.getSettings();
  if (!isYmd(date)) throw new Error("Pick a valid date");
  if (!isHm(time)) throw new Error("Pick a time from the list");
  if (date < istToday()) throw new Error("That date has passed — pick today or later");
  const off = settings.weekly_off ?? [];
  if (off.includes(weekday(date))) throw new Error(`The salon is closed on ${WEEKDAYS[weekday(date)]}`);
  const open = toMinutes(settings.opening_time ?? "10:00");
  const close = toMinutes(settings.closing_time ?? "21:00");
  const start = toMinutes(time);
  if (start < open || start + duration > close) throw new Error(`That runs outside opening hours (${time12(settings.opening_time ?? "10:00")}–${time12(settings.closing_time ?? "21:00")})`);
  const clash = await findClash(staff.id, date, time, duration, exceptId);
  if (clash) {
    const s = hm(clash.time);
    throw new Error(`${staff.name.split(" ")[0]} is booked ${time12(s)}–${time12(fromMinutes(toMinutes(s) + clash.duration_min))} (${clash.service_name}). Pick another time or stylist.`);
  }
}

export async function bookAppointment(input: { name: string; phone: string; email?: string | null; whatsappOptIn?: boolean; service_id: string; staff_id: string; date: string; time: string; notes?: string | null }, actor: string) {
  const [service, staff] = await Promise.all([db.get("services", input.service_id), db.get("staff", input.staff_id)]);
  if (!service || service.is_active === false) throw new Error("Pick a service from the list");
  if (!staff || staff.status !== "active") throw new Error("Pick an active stylist");
  const duration = service.duration_min ?? 30;
  await checkSlot(staff, input.date, input.time, duration);
  const { customer, created } = await findOrCreateMember(input);
  const apt: Appointment = {
    id: db.newId("apt"),
    customer_id: customer.id,
    staff_id: staff.id,
    service_id: service.id,
    service_name: service.name,
    service_price: service.price,
    date: input.date,
    time: input.time,
    duration_min: duration,
    status: "upcoming",
    invoice_id: null,
    notes: input.notes?.trim().slice(0, 300) || null,
    created_by: actor,
    created_at: now(),
    updated_at: now(),
  };
  try {
    await db.insert("appointments", apt);
  } catch (e) {
    // The database exclusion constraint caught a booking made at the same instant on another till.
    if (e instanceof DbError && /overlap|exclu|conflict/i.test(e.message)) throw new Error(`${staff.name.split(" ")[0]} was just booked at that time on another till. Pick another time.`);
    throw e;
  }
  return { appointment: apt, customer, created, staff };
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus, actor: string) {
  const apt = await db.get("appointments", id);
  if (!apt) throw new Error("Appointment not found");
  if (!NEXT_STATUS[apt.status].includes(status)) throw new Error(`A ${STATUS_LABEL[apt.status].toLowerCase()} appointment can't be marked ${STATUS_LABEL[status].toLowerCase()}`);
  if (status === "upcoming") {
    const staff = await db.get("staff", apt.staff_id);
    if (staff) await checkSlot(staff, apt.date, hm(apt.time), apt.duration_min, apt.id);
  }
  const ok = await db.updateIf("appointments", id, { status: apt.status }, { status, updated_at: now() });
  if (!ok) throw new Error("Someone else just changed this appointment — refresh and try again");
  await audit("appointments", id, `status:${status}`, actor, { from: apt.status });
  return apt;
}

// ---------- Invoices ----------

export interface InvoiceLineInput {
  item_type: "service" | "inventory";
  ref_id: string;
  description?: string;
  quantity: number;
  rate: number;
  staff_id: string;
}

export interface InvoiceInput {
  client_name: string;
  client_phone: string;
  client_address?: string | null;
  whatsapp_opt_in?: boolean;
  invoice_date: string;
  appointment_id?: string | null;
  lines: InvoiceLineInput[];
  discount?: number;
  tax_rate?: number;
  payment_method: PaymentMethod;
  payment_status: Invoice["payment_status"];
  amount_paid?: number;
}

/** Takes `qty` units off the shelf, or throws "Only N left". Compare-and-set, so two tills can't oversell. */
async function takeStock(itemId: string, qty: number) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const item = await db.get("inventory", itemId);
    if (!item) throw new Error("Product not found");
    if (item.quantity < qty) throw new Error(`Only ${item.quantity} left of ${item.name}`);
    if (await db.updateIf("inventory", itemId, { quantity: item.quantity }, { quantity: item.quantity - qty, updated_at: now() })) return item;
    await sleep(15 + Math.random() * 40);
  }
  throw new Error("Stock is being updated from another till. Please try again.");
}
async function putStock(itemId: string, qty: number) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const item = await db.get("inventory", itemId);
    if (!item) return;
    if (await db.updateIf("inventory", itemId, { quantity: item.quantity }, { quantity: item.quantity + qty, updated_at: now() })) return;
    await sleep(15 + Math.random() * 40);
  }
  console.error(`Could not return ${qty} unit(s) to stock for ${itemId}`);
}

/** Next consecutive number in the Indian financial year, e.g. INV2627-00042. */
async function nextInvoiceNo(date: string, prefix: string) {
  const fy = financialYear(date);
  for (let attempt = 0; attempt < 10; attempt++) {
    const c = await db.get("invoice_counters", fy);
    if (!c) {
      try {
        await db.insert("invoice_counters", { id: fy, last_no: 1 });
        return `${prefix}${fy}-00001`;
      } catch {
        continue; // created by another till first
      }
    }
    if (await db.updateIf("invoice_counters", fy, { last_no: c.last_no }, { last_no: c.last_no + 1 })) return `${prefix}${fy}-${String(c.last_no + 1).padStart(5, "0")}`;
    await sleep(10 + Math.random() * 30);
  }
  throw new Error("Couldn't get an invoice number — please try again");
}

export async function createInvoice(input: InvoiceInput, actor: string) {
  const settings = await db.getSettings();
  const name = input.client_name.trim();
  if (!name) throw new Error("Client name is required");
  if (!isYmd(input.invoice_date)) throw new Error("Pick a valid invoice date");
  const today = istToday();
  if (input.invoice_date > today) throw new Error("An invoice can't be dated in the future");
  if (input.invoice_date < `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`) throw new Error("An invoice can't be dated more than a year back");
  if (!input.lines.length) throw new Error("Add at least one service or product");
  if (input.lines.length > 50) throw new Error("A bill can have at most 50 lines");
  if (!(["cash", "upi", "card", "other"] as const).includes(input.payment_method)) throw new Error("Pick a payment method");
  if (!(["paid", "partial", "unpaid"] as const).includes(input.payment_status)) throw new Error("Pick a payment status");

  // Resolve every line against the catalogue and the team before anything is written.
  const [services, products, staff] = await Promise.all([db.list("services"), db.list("inventory"), db.list("staff")]);
  const svc = new Map(services.map((s) => [s.id, s]));
  const prod = new Map(products.map((p) => [p.id, p]));
  const team = new Map(staff.map((s) => [s.id, s]));
  const lines = input.lines.map((l, i) => {
    const n = i + 1;
    const ref = l.item_type === "service" ? svc.get(l.ref_id) : l.item_type === "inventory" ? prod.get(l.ref_id) : undefined;
    if (!ref) throw new Error(`Line ${n}: pick a service or product from the list`);
    const who = team.get(l.staff_id);
    if (!who) throw new Error(`Line ${n}: every line needs the stylist who did it`);
    if (who.status !== "active") throw new Error(`Line ${n}: ${who.name} is inactive`);
    const quantity = Number(l.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error(`Line ${n}: quantity must be a whole number from 1 to 999`);
    const rate = money(l.rate, `Line ${n} rate`, 1_000_000);
    return { ...l, quantity, rate, description: (l.description?.trim() || ref.name).slice(0, 120), ref };
  });
  const t = billTotals(lines, money(input.discount ?? 0, "Discount"), money(input.tax_rate ?? 0, "Tax rate", 100));
  const amountPaid = input.payment_status === "paid" ? t.total : input.payment_status === "unpaid" ? 0 : money(input.amount_paid ?? 0, "Amount paid");
  if (input.payment_status === "partial" && (amountPaid <= 0 || amountPaid >= t.total)) throw new Error(`Part payment must be more than ₹0 and less than the total (₹${t.total.toLocaleString("en-IN")})`);

  let appointment: Appointment | null = null;
  if (input.appointment_id) {
    appointment = await db.get("appointments", input.appointment_id);
    if (!appointment) throw new Error("That appointment no longer exists");
    if (appointment.invoice_id) throw new Error("That appointment has already been billed");
    if (appointment.status === "cancelled" || appointment.status === "no_show") throw new Error("That appointment was cancelled or a no-show — bill it as a walk-in instead");
  }

  const { customer } = await findOrCreateMember({ name, phone: input.client_phone, whatsappOptIn: input.whatsapp_opt_in });

  // 1. Stock first: if a product has run out, nothing else happens and no invoice number is used up.
  const need = new Map<string, number>();
  for (const l of lines) if (l.item_type === "inventory") need.set(l.ref_id, (need.get(l.ref_id) ?? 0) + l.quantity);
  const taken: [string, number][] = [];
  try {
    for (const [itemId, qty] of need) {
      await takeStock(itemId, qty);
      taken.push([itemId, qty]);
    }
  } catch (e) {
    for (const [itemId, qty] of taken) await putStock(itemId, qty);
    throw e;
  }

  // 2. Number, invoice and lines.
  const id = db.newId("inv");
  const createdAt = now();
  let invoice: Invoice;
  try {
    invoice = {
      id,
      invoice_no: await nextInvoiceNo(input.invoice_date, (settings.invoice_prefix || "INV").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)),
      invoice_date: input.invoice_date,
      customer_id: customer.id,
      client_name: name.slice(0, 100),
      client_phone: customer.phone,
      client_address: input.client_address?.trim().slice(0, 200) || null,
      appointment_id: appointment?.id ?? null,
      subtotal: t.subtotal,
      discount: t.discount,
      tax_rate: money(input.tax_rate ?? 0, "Tax rate", 100),
      tax: t.tax,
      total: t.total,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      amount_paid: amountPaid,
      status: "issued",
      void_reason: null,
      voided_at: null,
      loyalty_points: 0,
      created_by: actor,
      created_at: createdAt,
    };
    const items: InvoiceItem[] = lines.map((l, i) => ({
      id: `${id}_${i}`,
      invoice_id: id,
      invoice_date: input.invoice_date,
      item_type: l.item_type,
      service_id: l.item_type === "service" ? l.ref_id : null,
      inventory_id: l.item_type === "inventory" ? l.ref_id : null,
      description: l.description,
      quantity: l.quantity,
      rate: l.rate,
      amount: t.amounts[i],
      staff_id: l.staff_id,
    }));
    await db.insert("invoices", invoice);
    await db.insert("invoice_items", items);
    const moves: StockMovement[] = items
      .filter((it) => it.inventory_id)
      .map((it) => ({ id: db.newId("sm"), inventory_id: it.inventory_id!, delta: -it.quantity, reason: "sale", ref_invoice_id: id, note: null, created_by: actor, created_at: createdAt }));
    await db.insert("stock_movements", moves);
  } catch (e) {
    for (const [itemId, qty] of taken) await putStock(itemId, qty);
    throw e;
  }

  // 3. Close the booking and credit loyalty points. A hiccup here never undoes a saved bill.
  const notes: string[] = [];
  if (appointment) {
    const ok = await db.updateIf("appointments", appointment.id, { invoice_id: null }, { invoice_id: id, status: "completed", updated_at: now() });
    if (!ok) notes.push("the appointment was already billed elsewhere");
  }
  let points = 0;
  let tierUp = "";
  const serviceLines = lines.filter((l) => l.item_type === "service");
  const share = t.subtotal > 0 ? (t.subtotal - t.discount) / t.subtotal : 1; // spread the discount across services
  const at = input.invoice_date === today ? createdAt : new Date(`${input.invoice_date}T12:00:00+05:30`).toISOString();
  for (const [k, l] of serviceLines.entries()) {
    try {
      const r = await recordVisit({ customer_id: customer.id, service_id: l.ref_id, amount: round2(l.quantity * l.rate * share), at, newVisit: k === 0 });
      points += r.points_earned;
      if (r.tier_upgraded) tierUp = r.tier;
    } catch (e) {
      console.error("loyalty credit failed", e);
      notes.push("loyalty points couldn't be added — use Members → Record visit");
      break;
    }
  }
  if (points) await db.update("invoices", id, { loyalty_points: points });
  await audit("invoices", id, "create", actor, { invoice_no: invoice.invoice_no, total: invoice.total, lines: lines.length });
  return { invoice: { ...invoice, loyalty_points: points }, customer, points, tierUp, notes };
}

/** Void instead of delete: the number stays used, stock goes back, the guest's points come off. Owner only. */
export async function voidInvoice(id: string, reason: string, actor: string) {
  const inv = await db.get("invoices", id);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "void") throw new Error(`${inv.invoice_no} is already void`);
  const why = reason.trim();
  if (why.length < 3) throw new Error("Give a reason for voiding (it stays on the record)");
  if (!(await db.updateIf("invoices", id, { status: "issued" }, { status: "void", void_reason: why.slice(0, 200), voided_at: now() }))) throw new Error("This invoice was just changed — refresh and try again");
  const items = await db.query("invoice_items", { eq: { invoice_id: id } });
  for (const it of items.filter((x) => x.inventory_id)) {
    await putStock(it.inventory_id!, it.quantity);
    await db.insert("stock_movements", { id: db.newId("sm"), inventory_id: it.inventory_id!, delta: it.quantity, reason: "void", ref_invoice_id: id, note: `Void ${inv.invoice_no}`, created_by: actor, created_at: now() });
  }
  if (inv.customer_id && inv.loyalty_points > 0) {
    try {
      await addPoints(inv.customer_id, -inv.loyalty_points, false);
    } catch (e) {
      console.error("loyalty reversal failed", e);
    }
  }
  if (inv.appointment_id) await db.updateIf("appointments", inv.appointment_id, { invoice_id: id }, { invoice_id: null, updated_at: now() });
  await audit("invoices", id, "void", actor, { reason: why, total: inv.total });
  return inv;
}

export async function updatePayment(id: string, method: PaymentMethod, status: Invoice["payment_status"], amountPaidIn: unknown, actor: string) {
  const inv = await db.get("invoices", id);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "void") throw new Error("A void invoice can't take payments");
  if (!(["cash", "upi", "card", "other"] as const).includes(method)) throw new Error("Pick a payment method");
  const amount = status === "paid" ? inv.total : status === "unpaid" ? 0 : money(amountPaidIn, "Amount paid");
  if (status === "partial" && (amount <= 0 || amount >= inv.total)) throw new Error("Part payment must be more than ₹0 and less than the total");
  await db.update("invoices", id, { payment_method: method, payment_status: status, amount_paid: amount });
  await audit("invoices", id, "payment", actor, { from: { status: inv.payment_status, paid: inv.amount_paid }, to: { status, paid: amount, method } });
  return { ...inv, payment_status: status, amount_paid: amount };
}

/** wa.me link with the bill summary, to the guest's number in international format. */
export function invoiceWhatsAppLink(inv: Invoice, salon: string) {
  const text = `Hello ${inv.client_name.split(" ")[0]}, here is your bill ${inv.invoice_no} from ${salon}: ₹${inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${inv.loyalty_points ? ` · you earned ${inv.loyalty_points} loyalty points` : ""}. Thank you for visiting!`;
  return `https://wa.me/${normalisePhone(inv.client_phone)}?text=${encodeURIComponent(text)}`;
}

// ---------- Staff ----------

export interface StaffInput {
  name: string;
  phone?: string;
  email?: string;
  position: string;
  base_salary: unknown;
  commission_rate: unknown;
}
function cleanStaff(input: StaffInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const position = input.position.trim();
  if (!position) throw new Error("Position is required");
  const phone = input.phone ? normalisePhone(input.phone) : "";
  if (phone && !/^\d{10,15}$/.test(phone)) throw new Error("Enter a valid mobile number (or leave it empty)");
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email (or leave it empty)");
  const rate = money(input.commission_rate || 0, "Commission %", 100);
  return { name: name.slice(0, 80), position: position.slice(0, 60), phone: phone || null, email, base_salary: money(input.base_salary || 0, "Base salary", 1_000_000), commission_rate: rate };
}

export async function createStaff(input: StaffInput, actor: string) {
  const row: Staff = { id: db.newId("st"), ...cleanStaff(input), status: "active", created_at: now() };
  await db.insert("staff", row);
  await audit("staff", row.id, "create", actor, { base_salary: row.base_salary, commission_rate: row.commission_rate });
  return row;
}

export async function updateStaff(id: string, input: StaffInput, actor: string) {
  const before = await db.get("staff", id);
  if (!before) throw new Error("Staff member not found");
  const patch = cleanStaff(input);
  await db.update("staff", id, patch);
  if (before.base_salary !== patch.base_salary || before.commission_rate !== patch.commission_rate)
    await audit("staff", id, "pay_change", actor, { from: { base: before.base_salary, rate: before.commission_rate }, to: { base: patch.base_salary, rate: patch.commission_rate } });
  return { ...before, ...patch };
}

export async function setStaffStatus(id: string, status: Staff["status"], actor: string) {
  const s = await db.get("staff", id);
  if (!s) throw new Error("Staff member not found");
  if (status === "inactive") {
    const upcoming = await db.query("appointments", { eq: { staff_id: id }, in: { status: ACTIVE }, gte: { date: istToday() } });
    if (upcoming.length) throw new Error(`${s.name} has ${upcoming.length} upcoming booking(s). Move or cancel them first.`);
  }
  await db.update("staff", id, { status });
  await audit("staff", id, `status:${status}`, actor);
  return s;
}

/** Only for someone added by mistake. Anyone with history is deactivated instead, so past bills keep their name. */
export async function deleteStaff(id: string, actor: string) {
  const s = await db.get("staff", id);
  if (!s) throw new Error("Staff member not found");
  const [a, b, c, d] = await Promise.all([
    db.count("invoice_items", { eq: { staff_id: id } }),
    db.count("appointments", { eq: { staff_id: id } }),
    db.count("staff_attendance", { eq: { staff_id: id } }),
    db.count("staff_payroll", { eq: { staff_id: id } }),
  ]);
  if (a + b + c + d > 0) throw new Error(`${s.name} has bills, bookings, attendance or payroll on record — mark them inactive instead`);
  await db.remove("staff", id);
  await audit("staff", id, "delete", actor, { name: s.name });
  return s;
}

/** What each stylist billed in a date range, from issued invoices. */
export async function staffSales(from: string, to: string) {
  const [items, voided] = await Promise.all([
    db.query("invoice_items", { gte: { invoice_date: from }, lte: { invoice_date: to } }),
    db.query("invoices", { eq: { status: "void" }, gte: { invoice_date: from }, lte: { invoice_date: to } }),
  ]);
  const dead = new Set(voided.map((v) => v.id));
  const out = new Map<string, { billed: number; services: number; products: number; productSales: number; bills: Set<string> }>();
  for (const it of items) {
    if (dead.has(it.invoice_id)) continue;
    const r = out.get(it.staff_id) ?? { billed: 0, services: 0, products: 0, productSales: 0, bills: new Set<string>() };
    r.billed += it.amount;
    r.bills.add(it.invoice_id);
    if (it.item_type === "service") r.services += it.quantity;
    else {
      r.products += it.quantity;
      r.productSales += it.amount;
    }
    out.set(it.staff_id, r);
  }
  return new Map([...out].map(([k, v]) => [k, { billed: round2(v.billed), services: v.services, products: v.products, productSales: round2(v.productSales), bills: v.bills.size }]));
}

// ---------- Attendance ----------

export async function markAttendance(input: { staff_id: string; date: string; status: AttendanceStatus; check_in?: string | null; check_out?: string | null }, actor: string) {
  if (!isYmd(input.date)) throw new Error("Pick a valid date");
  if (input.date > istToday()) throw new Error("Attendance can't be marked for a future date");
  if (!(["present", "half_day", "leave", "absent"] as const).includes(input.status)) throw new Error("Pick present, half day, leave or absent");
  const staff = await db.get("staff", input.staff_id);
  if (!staff) throw new Error("Staff member not found");
  const working = input.status === "present" || input.status === "half_day";
  const checkIn = working && input.check_in ? input.check_in : null;
  const checkOut = working && input.check_out ? input.check_out : null;
  for (const t of [checkIn, checkOut]) if (t && !isHm(t)) throw new Error("Times must look like 09:45");
  if (checkIn && checkOut && checkOut <= checkIn) throw new Error("Check-out must be after check-in");
  const id = `att_${staff.id}_${input.date}`;
  const existing = await db.get("staff_attendance", id);
  // Quick-marking keeps times already entered unless the new status rules them out.
  const row: Attendance = {
    id,
    staff_id: staff.id,
    date: input.date,
    status: input.status,
    check_in: input.check_in === undefined ? (working ? existing?.check_in ?? null : null) : checkIn,
    check_out: input.check_out === undefined ? (working ? existing?.check_out ?? null : null) : checkOut,
    updated_at: now(),
  };
  if (existing) await db.update("staff_attendance", id, row);
  else {
    try {
      await db.insert("staff_attendance", row);
    } catch {
      await db.update("staff_attendance", id, row); // marked on another device a moment ago
    }
  }
  if (existing && existing.status !== row.status) await audit("staff_attendance", id, "change", actor, { from: existing.status, to: row.status });
  return { staff, row };
}

export async function clearAttendance(staffId: string, date: string, actor: string) {
  const id = `att_${staffId}_${date}`;
  const existing = await db.get("staff_attendance", id);
  if (!existing) return;
  await db.remove("staff_attendance", id);
  await audit("staff_attendance", id, "clear", actor, { was: existing.status });
}

// ---------- Payroll ----------

const payId = (staffId: string, year: number, month: number) => `pay_${staffId}_${year}_${String(month).padStart(2, "0")}`;

/** Builds or refreshes this month's draft for everyone. Paid rows are never touched; manual bonus/advance/deductions are kept. */
export async function generatePayroll(year: number, month: number, actor: string) {
  const today = istToday();
  const { from, to } = monthRange(year, month);
  if (from > today) throw new Error("That month hasn't started yet");
  const [settings, staff, attendance, existing, sales] = await Promise.all([
    db.getSettings(),
    db.list("staff"),
    db.query("staff_attendance", { gte: { date: from }, lte: { date: to } }),
    db.query("staff_payroll", { eq: { year, month } }),
    staffSales(from, to),
  ]);
  const byId = new Map(existing.map((p) => [p.id, p]));
  let created = 0;
  let refreshed = 0;
  let locked = 0;
  for (const s of staff) {
    const att = attendance.filter((a) => a.staff_id === s.id);
    const id = payId(s.id, year, month);
    const prev = byId.get(id);
    if (s.status !== "active" && !att.length && !prev) continue;
    if (prev?.status === "paid") {
      locked++;
      continue;
    }
    const calc = payrollFor({ staff: s, year, month, attendance: att, billed: sales.get(s.id)?.billed ?? 0, settings, bonus: prev?.bonus, advance: prev?.advance, deductions: prev?.deductions });
    if (prev) {
      await db.update("staff_payroll", id, { base_salary: s.base_salary, ...calc, updated_at: now() });
      refreshed++;
    } else {
      try {
        await db.insert("staff_payroll", { id, staff_id: s.id, year, month, base_salary: s.base_salary, ...calc, status: "pending", paid_at: null, created_at: now(), updated_at: now() });
        created++;
      } catch {
        refreshed++; // created a moment ago from another device
      }
    }
  }
  await audit("staff_payroll", `${year}-${month}`, "generate", actor, { created, refreshed, locked });
  return { created, refreshed, locked };
}

async function editablePayroll(id: string) {
  const p = await db.get("staff_payroll", id);
  if (!p) throw new Error("Payroll row not found");
  if (p.status === "paid") throw new Error("This salary is already paid and locked");
  return p;
}

export async function adjustPayroll(id: string, input: { bonus: unknown; advance: unknown; deductions: unknown }, actor: string) {
  const p = await editablePayroll(id);
  const bonus = money(input.bonus || 0, "Bonus", 1_000_000);
  const advance = money(input.advance || 0, "Advance", 1_000_000);
  const deductions = money(input.deductions || 0, "Deductions", 1_000_000);
  const total = round2(p.earned_base + p.commission + bonus - advance - deductions);
  if (!(await db.updateIf("staff_payroll", id, { status: p.status }, { bonus, advance, deductions, total, updated_at: now() }))) throw new Error("This row was just changed — refresh and try again");
  await audit("staff_payroll", id, "adjust", actor, { from: { bonus: p.bonus, advance: p.advance, deductions: p.deductions }, to: { bonus, advance, deductions } });
  return { ...p, total };
}

/** pending → processing → paid. Paying locks the row and books the salary as an expense. */
export async function setPayrollStatus(id: string, status: Payroll["status"], actor: string) {
  const p = await editablePayroll(id);
  if (!(["pending", "processing", "paid"] as const).includes(status)) throw new Error("Unknown status");
  const at = now();
  if (!(await db.updateIf("staff_payroll", id, { status: p.status }, { status, paid_at: status === "paid" ? at : null, updated_at: at }))) throw new Error("This row was just changed — refresh and try again");
  if (status === "paid") {
    const staff = await db.get("staff", p.staff_id);
    try {
      await db.insert("expenses", { id: `exp_${id}`, date: istToday(), name: `Salary · ${staff?.name ?? "staff"} · ${prettyDay(`${p.year}-${String(p.month).padStart(2, "0")}-01`, { month: "short", year: "numeric" })}`, category: "Salaries", amount: p.total, note: null, created_by: actor, created_at: at });
    } catch (e) {
      console.error("salary expense not booked", e);
    }
  }
  await audit("staff_payroll", id, `status:${status}`, actor, { total: p.total });
  return p;
}

export async function deletePayroll(id: string, actor: string) {
  const p = await editablePayroll(id);
  await db.remove("staff_payroll", id);
  await audit("staff_payroll", id, "delete", actor, { total: p.total });
}

// ---------- Expenses ----------

export async function saveExpense(input: { id?: string; date: string; name: string; category: string; amount: unknown; note?: string }, actor: string) {
  if (!isYmd(input.date)) throw new Error("Pick the date the money went out");
  if (input.date > istToday()) throw new Error("An expense can't be dated in the future");
  const name = input.name.trim();
  if (!name) throw new Error("What was it for?");
  const amount = money(input.amount, "Amount");
  if (amount <= 0) throw new Error("Amount must be more than ₹0");
  const row = { date: input.date, name: name.slice(0, 120), category: (input.category.trim() || "Other").slice(0, 40), amount, note: input.note?.trim().slice(0, 300) || null };
  if (input.id) {
    const before = await db.get("expenses", input.id);
    if (!before) throw new Error("Expense not found");
    await db.update("expenses", input.id, row);
    await audit("expenses", input.id, "update", actor, { from: { amount: before.amount, date: before.date }, to: { amount, date: row.date } });
    return { ...before, ...row };
  }
  const exp: Expense = { id: db.newId("exp"), ...row, created_by: actor, created_at: now() };
  await db.insert("expenses", exp);
  await audit("expenses", exp.id, "create", actor, { amount });
  return exp;
}

export async function deleteExpense(id: string, actor: string) {
  const e = await db.get("expenses", id);
  if (!e) throw new Error("Expense not found");
  await db.remove("expenses", id);
  await audit("expenses", id, "delete", actor, { name: e.name, amount: e.amount, date: e.date });
  return e;
}

// ---------- Catalogue: services & products ----------

export async function saveService(input: { id?: string; name: string; category: string; gender: string; price: unknown; duration_min: unknown; points: unknown; revisit_days: unknown }, actor: string) {
  const name = input.name.trim();
  if (!name) throw new Error("Service name is required");
  const gender = (["men", "women", "unisex"] as const).find((g) => g === input.gender);
  if (!gender) throw new Error("Pick men, women or unisex");
  const duration = Number(input.duration_min || 30);
  if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new Error("Duration must be 5–600 minutes");
  const points = Number(input.points || 0);
  if (!Number.isInteger(points) || points < 0 || points > 10_000) throw new Error("Points must be a whole number from 0");
  const revisit = input.revisit_days === "" || input.revisit_days === null || input.revisit_days === undefined ? null : Number(input.revisit_days);
  if (revisit !== null && (!Number.isInteger(revisit) || revisit < 1 || revisit > 730)) throw new Error("Revisit cycle must be 1–730 days, or empty");
  const row = { name: name.slice(0, 80), category: (input.category.trim() || "Other").slice(0, 40), gender, price: money(input.price, "Price", 1_000_000), duration_min: duration, points, revisit_days: revisit };
  if (input.id) {
    const before = await db.get("services", input.id);
    if (!before) throw new Error("Service not found");
    await db.update("services", input.id, row);
    if (before.price !== row.price) await audit("services", input.id, "price_change", actor, { from: before.price, to: row.price });
    return { ...before, ...row };
  }
  const svc: Service = { id: db.newId("svc"), ...row, is_active: true };
  await db.insert("services", svc);
  await audit("services", svc.id, "create", actor, { price: svc.price });
  return svc;
}

export async function setServiceActive(id: string, active: boolean, actor: string) {
  const s = await db.get("services", id);
  if (!s) throw new Error("Service not found");
  await db.update("services", id, { is_active: active });
  await audit("services", id, active ? "activate" : "retire", actor);
  return s;
}

export async function saveProduct(input: { id?: string; name: string; category: string; price: unknown; reorder_level: unknown; quantity?: unknown; description?: string }, actor: string) {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required");
  const reorder = Number(input.reorder_level || 0);
  if (!Number.isInteger(reorder) || reorder < 0 || reorder > 100_000) throw new Error("Reorder level must be a whole number from 0");
  const row = { name: name.slice(0, 100), category: input.category.trim().slice(0, 40) || null, description: input.description?.trim().slice(0, 300) || null, price: money(input.price, "Price", 1_000_000), reorder_level: reorder, updated_at: now() };
  if (input.id) {
    const before = await db.get("inventory", input.id);
    if (!before) throw new Error("Product not found");
    await db.update("inventory", input.id, row); // quantity only changes through stock movements
    if (before.price !== row.price) await audit("inventory", input.id, "price_change", actor, { from: before.price, to: row.price });
    return { ...before, ...row };
  }
  const qty = Number(input.quantity || 0);
  if (!Number.isInteger(qty) || qty < 0 || qty > 100_000) throw new Error("Opening stock must be a whole number from 0");
  const item: InventoryItem = { id: db.newId("inv"), ...row, quantity: qty, created_at: now() };
  await db.insert("inventory", item);
  if (qty) await db.insert("stock_movements", { id: db.newId("sm"), inventory_id: item.id, delta: qty, reason: "purchase", ref_invoice_id: null, note: "Opening stock", created_by: actor, created_at: now() });
  return item;
}

export async function adjustStock(id: string, deltaIn: unknown, reason: StockMovement["reason"], note: string, actor: string) {
  const delta = Number(deltaIn);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) throw new Error("Enter a whole number of units, e.g. 12 or -2");
  if (!(["purchase", "adjustment", "return"] as const).includes(reason as "purchase")) throw new Error("Pick purchase, return or adjustment");
  if (reason === "purchase" && delta < 0) throw new Error("A purchase adds stock — use an adjustment to remove units");
  let item: InventoryItem | null = null;
  if (delta < 0) item = await takeStock(id, -delta);
  else {
    item = await db.get("inventory", id);
    if (!item) throw new Error("Product not found");
    await putStock(id, delta);
  }
  await db.insert("stock_movements", { id: db.newId("sm"), inventory_id: id, delta, reason, ref_invoice_id: null, note: note.trim().slice(0, 200) || null, created_by: actor, created_at: now() });
  return { item, after: item.quantity + delta };
}

// ---------- Money view ----------

export async function moneyFor(from: string, to: string) {
  const [invoices, expenses] = await Promise.all([
    db.query("invoices", { gte: { invoice_date: from }, lte: { invoice_date: to } }),
    db.query("expenses", { gte: { date: from }, lte: { date: to } }),
  ]);
  const issued = invoices.filter((i) => i.status === "issued");
  const revenue = round2(issued.reduce((a, i) => a + i.total, 0));
  const collected = round2(issued.reduce((a, i) => a + i.amount_paid, 0));
  const spent = round2(expenses.reduce((a, e) => a + e.amount, 0));
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + e.amount));
  const byMethod = new Map<string, number>();
  for (const i of issued) byMethod.set(i.payment_method, round2((byMethod.get(i.payment_method) ?? 0) + i.amount_paid));
  return {
    revenue,
    collected,
    outstanding: round2(revenue - collected),
    bills: issued.length,
    voided: invoices.length - issued.length,
    avgBill: issued.length ? round2(revenue / issued.length) : 0,
    discounts: round2(issued.reduce((a, i) => a + i.discount, 0)),
    tax: round2(issued.reduce((a, i) => a + i.tax, 0)),
    expenses: spent,
    profit: round2(revenue - spent),
    margin: revenue > 0 ? ((revenue - spent) / revenue) * 100 : null,
    byCategory: [...byCategory].sort((a, b) => b[1] - a[1]),
    byMethod: [...byMethod].sort((a, b) => b[1] - a[1]),
    expenseRows: expenses.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
  };
}

export async function appointmentStats(from: string, to: string) {
  const rows = await db.query("appointments", { gte: { date: from }, lte: { date: to } });
  const by = (s: AppointmentStatus) => rows.filter((r) => r.status === s).length;
  const completed = by("completed");
  const noShow = by("no_show");
  return { total: rows.length, completed, noShow, cancelled: by("cancelled"), open: by("upcoming") + by("in_progress"), noShowRate: completed + noShow ? (noShow / (completed + noShow)) * 100 : 0 };
}
