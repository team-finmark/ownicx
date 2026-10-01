import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { isDemo } from "./db";
import { DbError, GENERIC_ERROR } from "./errors";
import { clientIp, gateFail, gateStatus, lockedResponse, type GateName } from "./gate";

/** Constant-time comparison that also hides the secret's length. */
function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Placeholder or short secrets count as "not configured": a guessable key is worse than none. */
function strong(v: string | undefined) {
  return v && v.length >= 24 && !/^change-?me$/i.test(v) ? v : undefined;
}

/**
 * Shared gate check: locked callers are refused before the secret is even compared; a wrong secret
 * is recorded against the caller's IP (and the gate's breaker). Returns null when the request may proceed.
 */
async function guard(req: Request, gate: GateName, expectedRaw: string | undefined, provided: string, missingMsg: string, deniedMsg: string): Promise<Response | null> {
  const expected = strong(expectedRaw);
  if (!expected) return isDemo() ? null : json({ error: missingMsg }, 503);
  const ip = clientIp(req);
  const status = await gateStatus(gate, ip);
  if (status.locked) return lockedResponse(status);
  if (safeEqual(provided, expected)) return null;
  await gateFail(gate, ip);
  return json({ error: deniedMsg }, 401);
}

/** REST API (POS / CRM / website): header `x-api-key`. */
export function requireApiKey(req: Request): Promise<Response | null> {
  return guard(req, "api", process.env.OWNICX_API_KEY, req.headers.get("x-api-key") ?? "", "OWNICX_API_KEY is not configured (24+ random characters)", "Invalid API key");
}

/** Scheduler endpoints: header `Authorization: Bearer <CRON_SECRET>`. */
export function requireCronSecret(req: Request): Promise<Response | null> {
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return guard(req, "cron", process.env.CRON_SECRET, got, "CRON_SECRET is not configured (24+ random characters)", "Unauthorised");
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export const MAX_BODY_BYTES = 64 * 1024;

/** Parsed JSON object, or a 400 Response when the body isn't a JSON object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "Request body too large" }, 413);
  let data: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Request body too large" }, 413);
    data = JSON.parse(text);
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Request body must be a JSON object" }, 400);
  return data as Record<string, unknown>;
}

/** Thrown for invalid input; becomes a 400 with the message. */
export class BadInput extends Error {}

export const optStr = (v: unknown, field: string, max = 200): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new BadInput(`${field} must be text`);
  if (v.length > max) throw new BadInput(`${field} is too long (max ${max} characters)`);
  return v.trim();
};
export const reqStr = (v: unknown, field: string, max = 200): string => {
  const s = optStr(v, field, max);
  if (!s) throw new BadInput(`${field} is required`);
  return s;
};
/** Phone numbers are accepted as text or as a plain number. */
export const phoneStr = (v: unknown, field = "phone"): string | null => {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return String(v);
  return optStr(v, field, 20);
};
export const optBool = (v: unknown, field: string): boolean => {
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") throw new BadInput(`${field} must be true or false`);
  return v;
};

/**
 * Error → response. Expected problems (bad input, not found, duplicates) keep their message;
 * programming errors are logged and hidden so internals never leak to API callers.
 */
export function fail(e: unknown, status = 400) {
  if (e instanceof BadInput) return json({ error: e.message }, 400);
  if (e instanceof DbError || e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError || !(e instanceof Error)) {
    console.error(e);
    return json({ error: GENERIC_ERROR }, 500);
  }
  return json({ error: e.message }, status);
}

/** Wraps a route handler so an unexpected failure (database down, Meta timeout…) is logged and answered with JSON 500. */
export function safeRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      console.error(e);
      return json({ error: GENERIC_ERROR }, 500);
    }
  };
}
