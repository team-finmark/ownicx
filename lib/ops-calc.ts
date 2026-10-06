// Money rules for salon operations — pure functions, shared by the server, the demo seed and the
// invoice builder's live preview, so the number on screen is the number that gets saved.

import { daysInMonth, round2, weekday } from "./ops-time";
import type { Attendance, Settings, Staff } from "./types";

export interface BillLine {
  quantity: number;
  rate: number;
}

/** amount = qty × rate; subtotal = Σ amounts; tax on (subtotal − discount); total rounded to paise. */
export function billTotals(lines: BillLine[], discount = 0, taxRate = 0) {
  const amounts = lines.map((l) => round2(l.quantity * l.rate));
  const subtotal = round2(amounts.reduce((a, b) => a + b, 0));
  const disc = round2(Math.min(Math.max(0, discount), subtotal));
  const tax = round2(((subtotal - disc) * Math.max(0, taxRate)) / 100);
  return { amounts, subtotal, discount: disc, tax, total: round2(subtotal - disc + tax) };
}

/** Days the salon is open in a month (calendar days minus the weekly off days). */
export function workingDays(year: number, month: number, weeklyOff: number[] = []) {
  let n = 0;
  const mm = String(month).padStart(2, "0");
  for (let d = 1; d <= daysInMonth(year, month); d++) if (!weeklyOff.includes(weekday(`${year}-${mm}-${String(d).padStart(2, "0")}`))) n++;
  return n;
}

/**
 * Payroll formula (owner to confirm the leave policy in Settings):
 *   paid_days   = present + ½ × half-days (+ leave, when leave is paid)
 *   earned_base = base × min(1, paid_days ÷ working_days)
 *   commission  = billed × commission_rate ÷ 100
 *   total       = earned_base + commission + bonus − advance − deductions
 * Statutory deductions (PF / ESI / professional tax) are not computed — enter them under deductions.
 */
export function payrollFor(input: {
  staff: Pick<Staff, "base_salary" | "commission_rate">;
  year: number;
  month: number;
  attendance: Pick<Attendance, "status">[];
  billed: number;
  settings: Pick<Settings, "weekly_off" | "paid_leave">;
  bonus?: number;
  advance?: number;
  deductions?: number;
}) {
  const working = workingDays(input.year, input.month, input.settings.weekly_off ?? []);
  const count = (s: Attendance["status"]) => input.attendance.filter((a) => a.status === s).length;
  const paid = count("present") + 0.5 * count("half_day") + (input.settings.paid_leave ? count("leave") : 0);
  const earned = working > 0 ? round2(input.staff.base_salary * Math.min(1, paid / working)) : input.staff.base_salary;
  const commission = round2((input.billed * input.staff.commission_rate) / 100);
  const bonus = input.bonus ?? 0;
  const advance = input.advance ?? 0;
  const deductions = input.deductions ?? 0;
  return {
    working_days: working,
    paid_days: paid,
    earned_base: earned,
    billed: round2(input.billed),
    commission_rate: input.staff.commission_rate,
    commission,
    bonus,
    advance,
    deductions,
    total: round2(earned + commission + bonus - advance - deductions),
  };
}

export const EXPENSE_CATEGORIES = ["Rent", "Salaries", "Products & supplies", "Utilities", "Marketing", "Maintenance", "Other"] as const;
export const STAFF_POSITIONS = ["Senior stylist", "Unisex hairdresser", "Male hairdresser", "Beautician", "Nail technician", "Makeup artist", "Housekeeping", "Receptionist"] as const;
export const PAYMENT_METHODS = { upi: "UPI", cash: "Cash", card: "Card", other: "Other" } as const;
