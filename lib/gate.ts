import "server-only";
import * as db from "./db";

/**
 * Lockout gates for every machine entry point (REST API, scheduler, WhatsApp webhook) and sign-in.
 *
 *  1. Per-IP lockout — N failures in a window locks that address out. Each repeat lockout doubles
 *     (15 min → 30 → 60 … capped at 24 h), so a persistent attacker is locked out for longer and longer.
 *  2. Gate breaker — when a whole gate sees a burst of failures from many addresses (a distributed
 *     attack), the gate locks shut for everyone for a cool-down. Not used for sign-in, so an attacker
 *     can never lock the manager out of their own dashboard.
 *  3. Fail closed — if the lock state can't be read, the request is refused, not waved through.
 *
 * State lives in the `login_attempts` table (id = "gate:<name>:<ip>" / "breaker:<name>"), so it is shared
 * by every server instance and survives restarts. Only failures write; successful calls only read.
 */

export type GateName = "api" | "cron" | "webhook" | "login";

interface GatePolicy {
  ipFailures: number; // failures per window before the IP is locked
  windowMs: number;
  baseLockMs: number; // first lockout; doubles on each repeat
  maxLockMs: number;
  breaker?: { failures: number; windowMs: number; lockMs: number }; // whole-gate lock
}

const MIN = 60_000;
export const POLICIES: Record<GateName, GatePolicy> = {
  api: { ipFailures: 10, windowMs: 15 * MIN, baseLockMs: 15 * MIN, maxLockMs: 24 * 60 * MIN, breaker: { failures: 200, windowMs: 10 * MIN, lockMs: 10 * MIN } },
  cron: { ipFailures: 5, windowMs: 15 * MIN, baseLockMs: 30 * MIN, maxLockMs: 24 * 60 * MIN, breaker: { failures: 50, windowMs: 10 * MIN, lockMs: 15 * MIN } },
  webhook: { ipFailures: 20, windowMs: 15 * MIN, baseLockMs: 15 * MIN, maxLockMs: 24 * 60 * MIN, breaker: { failures: 500, windowMs: 10 * MIN, lockMs: 10 * MIN } },
  login: { ipFailures: 20, windowMs: 15 * MIN, baseLockMs: 15 * MIN, maxLockMs: 24 * 60 * MIN },
};

/**
 * Row encoding (no schema change): `n` = failures in the current window; `until` = window end, or the
 * lock end while locked. A locked row has n >= threshold. The repeat-lock level is kept in the id suffix row.
 */
const ipKey = (g: GateName, ip: string) => `gate:${g}:${ip}`.slice(0, 200);
const levelKey = (g: GateName, ip: string) => `gatelvl:${g}:${ip}`.slice(0, 200);
const breakerKey = (g: GateName) => `breaker:${g}`;

export function clientIp(req: Request) {
  // On Vercel the first X-Forwarded-For hop is set by the platform; elsewhere it's best-effort.
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

export interface GateStatus {
  locked: boolean;
  retryAfterS: number;
  reason?: "ip" | "gate" | "unavailable";
}

/** Is this caller (or the whole gate) locked out right now? Fails closed. */
export async function gateStatus(g: GateName, ip: string): Promise<GateStatus> {
  try {
    const p = POLICIES[g];
    const now = Date.now();
    const [own, brk] = await Promise.all([db.get("login_attempts", ipKey(g, ip)), p.breaker ? db.get("login_attempts", breakerKey(g)) : Promise.resolve(null)]);
    if (brk && p.breaker && brk.n >= p.breaker.failures && Date.parse(brk.until) > now) {
      return { locked: true, retryAfterS: Math.ceil((Date.parse(brk.until) - now) / 1000), reason: "gate" };
    }
    if (own && own.n >= p.ipFailures && Date.parse(own.until) > now) {
      return { locked: true, retryAfterS: Math.ceil((Date.parse(own.until) - now) / 1000), reason: "ip" };
    }
    return { locked: false, retryAfterS: 0 };
  } catch {
    return { locked: true, retryAfterS: 60, reason: "unavailable" };
  }
}

/** Atomic-ish counter bump with compare-and-set; creates the row on first failure. */
async function bump(id: string, windowMs: number, threshold: number, lockMs: () => Promise<number>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    const row = await db.get("login_attempts", id);
    if (!row || Date.parse(row.until) <= now) {
      // Fresh window (or an expired lock).
      const fresh = { n: 1, until: new Date(now + windowMs).toISOString() };
      try {
        if (row) {
          if (await db.updateIf("login_attempts", id, { n: row.n, until: row.until }, fresh)) return 1;
        } else {
          await db.insert("login_attempts", { id, ...fresh });
          return 1;
        }
      } catch {
        /* lost a race; retry */
      }
      continue;
    }
    const n = row.n + 1;
    // Crossing the threshold turns the window into a lock.
    const until = n === threshold ? new Date(now + (await lockMs())).toISOString() : row.until;
    if (await db.updateIf("login_attempts", id, { n: row.n, until: row.until }, { n, until })) return n;
  }
  return threshold; // under heavy contention, assume the worst
}

/** Record a failed attempt (bad key, bad secret, bad signature, wrong password). */
export async function gateFail(g: GateName, ip: string) {
  const p = POLICIES[g];
  try {
    await bump(ipKey(g, ip), p.windowMs, p.ipFailures, async () => {
      // Each repeat lockout doubles, remembered for 7 days.
      const lvl = await db.get("login_attempts", levelKey(g, ip));
      const level = lvl && Date.parse(lvl.until) > Date.now() ? lvl.n + 1 : 1;
      const until = new Date(Date.now() + 7 * 24 * 60 * MIN).toISOString();
      if (lvl) await db.update("login_attempts", levelKey(g, ip), { n: level, until });
      else await db.insert("login_attempts", { id: levelKey(g, ip), n: level, until }).catch(() => {});
      return Math.min(p.baseLockMs * 2 ** (level - 1), p.maxLockMs);
    });
    if (p.breaker) {
      const b = p.breaker;
      await bump(breakerKey(g), b.windowMs, b.failures, async () => b.lockMs);
    }
  } catch {
    /* recording is best-effort; the check side fails closed */
  }
}

/** A JSON 429/423 for a locked gate, with Retry-After. */
export function lockedResponse(s: GateStatus) {
  const msg =
    s.reason === "gate"
      ? "This endpoint is temporarily locked after a burst of failed requests. Try again later."
      : s.reason === "unavailable"
        ? "Security check unavailable. Try again shortly."
        : "Too many failed attempts from your address. Try again later.";
  return Response.json({ error: msg }, { status: s.reason === "unavailable" ? 503 : 429, headers: { "Retry-After": String(s.retryAfterS), "Cache-Control": "no-store" } });
}
