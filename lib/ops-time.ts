// Calendar helpers for salon operations. Every business date is an India-time calendar day
// ("YYYY-MM-DD") and every clock time is "HH:MM" — never a UTC timestamp sliced to 10 characters.
// Pure and dependency-free, so pages, actions and client components share one definition.

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** Today in India, e.g. "2026-10-07". Correct between 00:00 and 05:30 IST, unlike toISOString(). */
export const istToday = (now: number | Date = Date.now()) => ymdFmt.format(new Date(now));

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Date arithmetic on calendar days (done in UTC so no timezone or DST can shift it). */
export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** Monday of the week containing `ymd` (weeks run Monday–Sunday everywhere in the app). */
export const weekStart = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1–12
}

export function monthRange(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}` };
}

/** "2026-10" → { year: 2026, month: 10 }; falls back to the current India month. */
export function parseMonth(s: string | undefined, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] };
  const [y, mo] = istToday(now).split("-").map(Number);
  return { year: y, month: mo };
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Indian financial year (1 April – 31 March) as "YYYY" of the two short years, e.g. 2026-10-07 → "2627". */
export function financialYear(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

export const toMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Bookable start times between opening and closing, every `step` minutes. */
export function slots(open = "10:00", close = "21:00", step = 15) {
  const out: string[] = [];
  for (let t = toMinutes(open); t < toMinutes(close); t += Math.max(5, step)) out.push(fromMinutes(t));
  return out;
}

/** "14:30" → "2:30 pm" */
export function time12(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "2026-10-07" → "7 Oct 2026" (or with weekday). */
export function prettyDay(ymd: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(new Date(`${ymd}T00:00:00Z`));
}

export type Period = "today" | "week" | "month" | "ytd" | "fy" | "custom";

/**
 * Date range for a reporting period plus the equal-length range just before it (for growth deltas).
 * "ytd" = 1 January → today; "fy" = 1 April → today.
 */
export function periodRange(period: string, from?: string, to?: string, now = Date.now()) {
  const today = istToday(now);
  let p = (["today", "week", "month", "ytd", "fy", "custom"].includes(period) ? period : "month") as Period;
  let f = today;
  let t = today;
  if (p === "custom" && from && to && isYmd(from) && isYmd(to)) [f, t] = from <= to ? [from, to] : [to, from];
  else if (p === "custom") p = "month";
  if (p === "week") f = weekStart(today);
  if (p === "month") f = `${today.slice(0, 7)}-01`;
  if (p === "ytd") f = `${today.slice(0, 4)}-01-01`;
  if (p === "fy") {
    const fy = financialYear(today);
    f = `20${fy.slice(0, 2)}-04-01`;
  }
  const len = daysBetween(f, t) + 1;
  return { period: p, from: f, to: t, prevFrom: addDays(f, -len), prevTo: addDays(f, -1), days: len };
}

/** RFC 4180 CSV: quote every field that needs it, so names with commas don't shift columns. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          // A leading = + - @ would run as a formula in Excel; prefix it so it stays text.
          const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
          return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\r\n");
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
