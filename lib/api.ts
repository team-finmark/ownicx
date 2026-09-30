import "server-only";
import { timingSafeEqual } from "node:crypto";
import { isDemo } from "./db";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Placeholder or short secrets count as "not configured": a guessable key is worse than none. */
function strong(v: string | undefined) {
  return v && v.length >= 24 && !/^change-?me$/i.test(v) ? v : undefined;
}

/** Returns an error Response when the request isn't authorised, otherwise null. */
export function requireApiKey(req: Request): Response | null {
  const expected = strong(process.env.OWNICX_API_KEY);
  if (!expected) {
    // Open only while running on throwaway demo data.
    return isDemo() ? null : json({ error: "OWNICX_API_KEY is not configured (24+ random characters)" }, 503);
  }
  const got = req.headers.get("x-api-key") ?? "";
  return safeEqual(got, expected) ? null : json({ error: "Invalid API key" }, 401);
}

export function requireCronSecret(req: Request): Response | null {
  const expected = strong(process.env.CRON_SECRET);
  if (!expected) return isDemo() ? null : json({ error: "CRON_SECRET is not configured (24+ random characters)" }, 503);
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(got, expected) ? null : json({ error: "Unauthorised" }, 401);
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Parsed JSON object, or a 400 Response when the body isn't a JSON object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  let data: unknown;
  try {
    data = await req.json();
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
  if (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError || !(e instanceof Error)) {
    console.error(e);
    return json({ error: "Something went wrong on our side. Please try again." }, 500);
  }
  return json({ error: e.message }, status);
}
