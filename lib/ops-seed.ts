// Demo data for salon operations, built from the loyalty demo (same members, same visit history)
// so bills, stylist sales, payroll and the money view all tell one consistent story.

import { payrollFor, billTotals } from "./ops-calc";
import { addDays, financialYear, fromMinutes, istToday, monthRange, toMinutes, weekday } from "./ops-time";
import type {
  Appointment,
  Attendance,
  Customer,
  Expense,
  Invoice,
  InvoiceCounter,
  InvoiceItem,
  InventoryItem,
  Payroll,
  Service,
  Settings,
  Staff,
  StockMovement,
  Visit,
} from "./types";

const DAY = 86_400_000;

export const STAFF: Staff[] = [
  { id: "st_asha", name: "Asha Rao", phone: "919811100001", email: null, position: "Senior stylist", status: "active", base_salary: 22000, commission_rate: 8, created_at: "2025-06-01T04:30:00.000Z" },
  { id: "st_imran", name: "Imran Shaikh", phone: "919811100002", email: null, position: "Unisex hairdresser", status: "active", base_salary: 18000, commission_rate: 6, created_at: "2025-06-01T04:30:00.000Z" },
  { id: "st_ravi", name: "Ravi Kumar", phone: "919811100003", email: null, position: "Male hairdresser", status: "active", base_salary: 16000, commission_rate: 6, created_at: "2025-08-15T04:30:00.000Z" },
  { id: "st_meena", name: "Meena Pillai", phone: "919811100004", email: null, position: "Beautician", status: "active", base_salary: 17000, commission_rate: 7, created_at: "2025-06-01T04:30:00.000Z" },
  { id: "st_lakshmi", name: "Lakshmi Devi", phone: "919811100005", email: null, position: "Housekeeping", status: "active", base_salary: 11000, commission_rate: 0, created_at: "2025-06-01T04:30:00.000Z" },
];

/** Who usually does which service in the demo salon. */
const CAN_DO: Record<string, string[]> = {
  Hair: ["st_asha", "st_imran", "st_ravi"],
  Grooming: ["st_ravi", "st_imran"],
  Skin: ["st_meena"],
  Nails: ["st_meena"],
  Makeup: ["st_meena", "st_asha"],
};

const PRODUCTS: Omit<InventoryItem, "created_at" | "updated_at">[] = [
  { id: "inv_shampoo", name: "Keratin repair shampoo 250ml", category: "Hair care", description: null, quantity: 18, price: 650, reorder_level: 6 },
  { id: "inv_serum", name: "Argan hair serum 50ml", category: "Hair care", description: null, quantity: 4, price: 899, reorder_level: 5 },
  { id: "inv_mask", name: "Deep-conditioning mask", category: "Hair care", description: null, quantity: 9, price: 1150, reorder_level: 4 },
  { id: "inv_beardoil", name: "Beard oil 30ml", category: "Grooming", description: null, quantity: 12, price: 450, reorder_level: 4 },
  { id: "inv_sunscreen", name: "SPF 50 sunscreen", category: "Skin care", description: null, quantity: 2, price: 799, reorder_level: 4 },
  { id: "inv_cuticle", name: "Cuticle oil", category: "Nails", description: null, quantity: 15, price: 299, reorder_level: 5 },
];

const WALK_IN_FIRST = ["Rahul", "Sana", "Vikram", "Nandini", "Arif", "Deepa", "Karthik", "Shreya", "Manoj", "Fatima", "Suresh", "Divya", "Abhishek", "Keerthi", "Naveen", "Swathi", "Rajesh", "Pallavi", "Sameer", "Bhavana"];
const LAST_INITIAL = ["R", "K", "S", "M", "P", "V", "N", "A", "G", "T"];

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildOpsSeed(input: { now: number; customers: Customer[]; visits: Visit[]; services: Service[]; settings: Settings }) {
  const { now, customers, visits, services, settings } = input;
  const rnd = prng(7_10_2026);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const today = istToday(now);
  const iso = (ymd: string, hm = "12:00") => new Date(`${ymd}T${hm}:00+05:30`).toISOString();
  const off = settings.weekly_off ?? [];
  const openDay = (ymd: string) => (off.includes(weekday(ymd)) ? addDays(ymd, 1) : ymd);
  const svcById = new Map(services.map((s) => [s.id, s]));
  const custById = new Map(customers.map((c) => [c.id, c]));
  const staffFor = (s: Service) => pick(CAN_DO[s.category] ?? ["st_asha"]);

  const inventory: InventoryItem[] = PRODUCTS.map((p) => ({ ...p, created_at: iso(addDays(today, -200)), updated_at: iso(addDays(today, -1)) }));
  const stock_movements: StockMovement[] = [];
  const invoices: Invoice[] = [];
  const invoice_items: InvoiceItem[] = [];
  const appointments: Appointment[] = [];

  // ---- Bills over the last ~75 days ----
  // Members' bills come from their loyalty visits; walk-in guests who never joined fill out a normal day.
  type Line = Omit<InvoiceItem, "id" | "invoice_id" | "amount">;
  type Spec = { date: string; time: string; customer: Customer | null; walkIn?: { name: string; phone: string }; lines: Line[]; points: number };
  const specs: Spec[] = [];
  const open = toMinutes(settings.opening_time ?? "10:00");
  const close = toMinutes(settings.closing_time ?? "21:00");
  const billTime = () => fromMinutes(open + 30 + Math.floor(rnd() * ((close - open - 60) / 15)) * 15);
  const nowMin = Math.floor((now / 60_000 + 330) % 1440); // minutes since midnight, India time
  const maybeProduct = (lines: Line[], date: string, odds: number) => {
    if (rnd() >= odds) return;
    const p = pick(PRODUCTS);
    lines.push({ invoice_date: date, item_type: "inventory", service_id: null, inventory_id: p.id, description: p.name, quantity: 1, rate: p.price, staff_id: lines[0].staff_id });
  };

  const since = now - 75 * DAY;
  const groups = new Map<string, Visit[]>();
  for (const v of visits) {
    if (Date.parse(v.at) < since) continue;
    const key = `${v.customer_id}|${openDay(istToday(Date.parse(v.at)))}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  for (const [key, vs] of groups) {
    const [customerId, date] = key.split("|");
    const c = custById.get(customerId);
    if (!c || date > today) continue;
    const lines: Line[] = vs.map((v) => {
      const s = svcById.get(v.service_id)!;
      return { invoice_date: date, item_type: "service", service_id: s.id, inventory_id: null, description: s.name, quantity: 1, rate: v.amount, staff_id: staffFor(s) };
    });
    maybeProduct(lines, date, 0.18);
    let time = billTime();
    if (date === today && toMinutes(time) > nowMin) time = fromMinutes(Math.max(open, nowMin - 5)); // not later than now
    specs.push({ date, time, customer: c, lines, points: vs.reduce((a, v) => a + v.points_earned, 0) });
  }
  const walkInMenu = services.filter((s) => s.id !== "bridal" && s.id !== "keratin");
  for (let d = 75; d >= 0; d--) {
    const date = addDays(today, -d);
    if (off.includes(weekday(date))) continue;
    const n = 4 + Math.floor(rnd() * 5) + (weekday(date) === 0 || weekday(date) === 6 ? 3 : 0); // busier weekends
    for (let j = 0; j < n; j++) {
      const time = billTime();
      if (d === 0 && toMinutes(time) > nowMin) continue; // today: only what has happened so far
      const first = pick(WALK_IN_FIRST);
      const s1 = pick(walkInMenu);
      const lines: Line[] = [{ invoice_date: date, item_type: "service", service_id: s1.id, inventory_id: null, description: s1.name, quantity: 1, rate: s1.price, staff_id: staffFor(s1) }];
      if (rnd() < 0.3) {
        const s2 = pick(walkInMenu.filter((x) => x.id !== s1.id));
        lines.push({ invoice_date: date, item_type: "service", service_id: s2.id, inventory_id: null, description: s2.name, quantity: 1, rate: s2.price, staff_id: staffFor(s2) });
      }
      maybeProduct(lines, date, 0.12);
      specs.push({ date, time, customer: null, walkIn: { name: `${first} ${pick(LAST_INITIAL)}.`, phone: `9197${String(10000000 + Math.floor(rnd() * 89999999)).slice(0, 8)}` }, lines, points: 0 });
    }
  }

  // Numbered in the order they happened, consecutively per financial year.
  specs.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const counters = new Map<string, number>();
  specs.forEach((b, k) => {
    const { date, time, lines } = b;
    const discount = rnd() < 0.1 ? 100 * (1 + Math.floor(rnd() * 3)) : 0;
    const t = billTotals(lines, discount, 0);
    const fy = financialYear(date);
    const n = (counters.get(fy) ?? 0) + 1;
    counters.set(fy, n);
    const id = `inv_demo_${String(k + 1).padStart(5, "0")}`;
    const unpaid = date >= addDays(today, -3) && rnd() < 0.05;
    invoices.push({
      id,
      invoice_no: `${settings.invoice_prefix ?? "INV"}${fy}-${String(n).padStart(5, "0")}`,
      invoice_date: date,
      customer_id: b.customer?.id ?? null,
      client_name: b.customer?.name ?? b.walkIn!.name,
      client_phone: b.customer?.phone ?? b.walkIn!.phone,
      client_address: null,
      appointment_id: null,
      subtotal: t.subtotal,
      discount: t.discount,
      tax_rate: 0,
      tax: t.tax,
      total: t.total,
      payment_method: rnd() < 0.55 ? "upi" : rnd() < 0.67 ? "cash" : "card",
      payment_status: unpaid ? "partial" : "paid",
      amount_paid: unpaid ? Math.round(t.total / 2) : t.total,
      status: "issued",
      void_reason: null,
      voided_at: null,
      loyalty_points: b.points,
      created_by: "manager",
      created_at: iso(date, time),
    });
    lines.forEach((l, j) => {
      invoice_items.push({ ...l, id: `${id}_${j}`, invoice_id: id, amount: t.amounts[j] });
      if (l.inventory_id) stock_movements.push({ id: `sm_${id}_${j}`, inventory_id: l.inventory_id, delta: -l.quantity, reason: "sale", ref_invoice_id: id, note: null, created_by: "manager", created_at: iso(date, time) });
    });
    // The booking behind a member's bill (most members book ahead).
    if (b.customer && rnd() < 0.7) {
      const first = lines[0];
      const s = svcById.get(first.service_id!)!;
      appointments.push({
        id: `apt_demo_${k}`,
        customer_id: b.customer.id,
        staff_id: first.staff_id,
        service_id: s.id,
        service_name: s.name,
        service_price: s.price,
        date,
        time: fromMinutes(Math.max(open, toMinutes(time) - (s.duration_min ?? 30))),
        duration_min: s.duration_min ?? 30,
        status: "completed",
        invoice_id: id,
        notes: null,
        created_by: "manager",
        created_at: iso(addDays(date, -2)),
        updated_at: iso(date, time),
      });
      invoices[invoices.length - 1].appointment_id = `apt_demo_${k}`;
    }
  });
  // One voided bill, to show the trail.
  const voided = invoices[Math.floor(invoices.length / 3)];
  if (voided) Object.assign(voided, { status: "void", void_reason: "Entered twice by mistake", voided_at: voided.created_at });
  const invoice_counters: InvoiceCounter[] = [...counters.entries()].map(([id, last_no]) => ({ id, last_no }));

  // ---- Upcoming bookings: today and the next three open days, never overlapping per stylist ----
  const bookable = services.filter((s) => s.revisit_days !== null);
  for (let d = 0, made = 0; d < 6 && made < 4; d++) {
    const date = addDays(today, d);
    if (off.includes(weekday(date))) continue;
    made++;
    for (const st of STAFF.filter((s) => s.commission_rate > 0)) {
      let t = open + 30 + Math.floor(rnd() * 4) * 30;
      const n = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const s = pick(bookable.filter((x) => (CAN_DO[x.category] ?? []).includes(st.id)).concat(bookable.slice(0, 1)));
        const dur = s.duration_min ?? 30;
        if (t + dur > close) break;
        const c = pick(customers);
        const status = d === 0 && t + dur <= nowMin ? (rnd() < 0.15 ? "no_show" : "completed") : d === 0 && t <= nowMin ? "in_progress" : "upcoming";
        appointments.push({
          id: `apt_up_${date}_${st.id}_${j}`,
          customer_id: c.id,
          staff_id: st.id,
          service_id: s.id,
          service_name: s.name,
          service_price: s.price,
          date,
          time: fromMinutes(t),
          duration_min: dur,
          status,
          invoice_id: null,
          notes: j === 0 && rnd() < 0.3 ? "Prefers a quiet chair" : null,
          created_by: "manager",
          created_at: iso(addDays(date, -3)),
          updated_at: iso(addDays(date, -3)),
        });
        t += dur + 15 + Math.floor(rnd() * 3) * 15;
      }
    }
  }

  // ---- Attendance: last ~45 days ----
  const staff_attendance: Attendance[] = [];
  for (let d = 45; d >= 0; d--) {
    const date = addDays(today, -d);
    if (off.includes(weekday(date))) continue;
    for (const st of STAFF) {
      if (d === 0 && rnd() < 0.4) continue; // today isn't fully marked yet
      const r = rnd();
      const status: Attendance["status"] = r < 0.86 ? "present" : r < 0.91 ? "half_day" : r < 0.97 ? "leave" : "absent";
      staff_attendance.push({
        id: `att_${st.id}_${date}`,
        staff_id: st.id,
        date,
        status,
        check_in: status === "present" || status === "half_day" ? fromMinutes(open - 15 + Math.floor(rnd() * 4) * 5) : null,
        check_out: status === "present" ? fromMinutes(close + Math.floor(rnd() * 3) * 10) : status === "half_day" ? fromMinutes(open + 240) : null,
        updated_at: iso(date, "21:30"),
      });
    }
  }

  // ---- Expenses: last four months ----
  const expenses: Expense[] = [];
  const [ty, tm] = today.split("-").map(Number);
  let e = 0;
  const addExp = (date: string, name: string, category: string, amount: number) => {
    if (date > today) return;
    expenses.push({ id: `exp_demo_${e++}`, date, name, category, amount, note: null, created_by: "manager", created_at: iso(date, "18:00") });
  };
  const payroll: Payroll[] = [];
  for (let back = 3; back >= 0; back--) {
    const y = tm - back <= 0 ? ty - 1 : ty;
    const m = ((tm - back - 1 + 12) % 12) + 1;
    const { from } = monthRange(y, m);
    addExp(from, "Shop rent", "Rent", 38000);
    addExp(addDays(from, 4), "Electricity bill", "Utilities", 7200 + Math.round(rnd() * 2500));
    addExp(addDays(from, 6), "Internet & phone", "Utilities", 1499);
    addExp(addDays(from, 8), "Colour & chemicals restock", "Products & supplies", 11000 + Math.round(rnd() * 5000));
    addExp(addDays(from, 19), "Disposables & towels", "Products & supplies", 3500 + Math.round(rnd() * 1500));
    addExp(addDays(from, 14), "Instagram promotion", "Marketing", 2500);
    if (back === 1) addExp(addDays(from, 22), "AC servicing", "Maintenance", 3200);

    // Last month's payroll, paid on its last day (and booked as an expense).
    if (back === 1) {
      const range = monthRange(y, m);
      for (const st of STAFF) {
        const att = staff_attendance.filter((a) => a.staff_id === st.id && a.date >= range.from && a.date <= range.to);
        const billed = invoice_items
          .filter((it) => it.staff_id === st.id && it.invoice_date >= range.from && it.invoice_date <= range.to && invoices.find((i) => i.id === it.invoice_id)?.status === "issued")
          .reduce((a, it) => a + it.amount, 0);
        const calc = payrollFor({ staff: st, year: y, month: m, attendance: att, billed, settings, bonus: st.id === "st_asha" ? 1500 : 0, advance: st.id === "st_ravi" ? 2000 : 0 });
        const paidOn = range.to;
        const id = `pay_${st.id}_${y}_${String(m).padStart(2, "0")}`;
        payroll.push({ id, staff_id: st.id, year: y, month: m, base_salary: st.base_salary, ...calc, status: "paid", paid_at: iso(paidOn, "11:00"), created_at: iso(paidOn, "10:00"), updated_at: iso(paidOn, "11:00") });
        addExp(paidOn, `Salary · ${st.name}`, "Salaries", calc.total);
      }
    }
  }

  return { staff: STAFF, inventory, stock_movements, appointments, invoices, invoice_items, invoice_counters, expenses, staff_attendance, staff_payroll: payroll, audit_log: [] };
}
