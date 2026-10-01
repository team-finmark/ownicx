import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

/**
 * Gate 0 — runs before every page and API request:
 *  1. Method allow-list per route family (anything else → 405).
 *  2. Per-IP rate limit per route family (fixed 1-minute window, per server instance).
 *  3. Security headers on every response, incl. a per-request CSP nonce (scripts run only with it).
 *  4. Pages: signed-out visitors are sent to /login (optimistic — pages, layout and every server
 *     action re-verify the session against the database).
 * API routes then pass their own gates (API key / cron secret / webhook signature + lockouts, lib/gate.ts).
 */

const isProd = process.env.NODE_ENV === "production";

type Family = "page" | "api" | "cron" | "webhook";
const LIMITS: Record<Family, number> = { page: 300, api: 120, cron: 30, webhook: 600 }; // requests / minute / IP
const POST_LIMIT = 60; // page POSTs (sign-in, dashboard actions) / minute / IP
// In-app navigation and link prefetching fetch RSC payloads in the background (~25 per page view),
// so they get their own, larger budget instead of eating into full page loads.
const RSC_LIMIT = 1500;
const METHODS: Record<Family, string[]> = {
  page: ["GET", "HEAD", "POST"],
  api: ["GET", "POST"],
  cron: ["GET"],
  webhook: ["GET", "POST"],
};

function family(path: string): Family {
  if (path.startsWith("/api/v1/")) return "api";
  if (path.startsWith("/api/automations/") || path.startsWith("/api/messages/")) return "cron";
  if (path.startsWith("/api/whatsapp/")) return "webhook";
  return "page";
}

// ---- rate limiter (best-effort per instance; the database-backed lockouts are the hard stop) ----
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    hits.set(key, { n: 1, reset: now + 60_000 });
    return 0;
  }
  h.n++;
  return h.n > max ? Math.ceil((h.reset - now) / 1000) : 0;
}

function csp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", // React style attributes; scripts stay locked to the nonce
    "img-src 'self' data: blob: https://api.qrserver.com https://*.facebook.com https://*.fbcdn.net",
    "font-src 'self' data:",
    `connect-src 'self' https://*.facebook.com${isProd ? "" : " ws: wss:"}`,
    "frame-src https://*.facebook.com", // Meta sign-in (Settings → WhatsApp)
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function secure(res: NextResponse, policy?: string) {
  const h = res.headers;
  if (policy) h.set("Content-Security-Policy", policy);
  else h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (isProd) h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  h.set("X-DNS-Prefetch-Control", "off");
  h.set("Cache-Control", "private, no-store");
  return res;
}

function reject(status: number, message: string, extra: Record<string, string> = {}) {
  return secure(NextResponse.json({ error: message }, { status, headers: extra }));
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const fam = family(pathname);
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();

  if (!METHODS[fam].includes(req.method)) return reject(405, "Method not allowed", { Allow: METHODS[fam].join(", ") });

  // Next.js strips its RSC headers before the proxy runs, so use the browser-set Sec-Fetch-Mode:
  // "navigate" = a real page load; anything else from a browser = background fetch/prefetch.
  // Clients that don't send it (scripts, curl) are treated as page loads — the stricter budget.
  const fetchMode = req.headers.get("sec-fetch-mode");
  const background = fam === "page" && req.method === "GET" && !!fetchMode && fetchMode !== "navigate";
  const wait = background
    ? limited(`rsc:${ip}`, RSC_LIMIT)
    : limited(`${fam}:${ip}`, LIMITS[fam]) || (fam === "page" && req.method === "POST" ? limited(`post:${ip}`, POST_LIMIT) : 0);
  if (wait) return reject(429, "Too many requests. Slow down and try again shortly.", { "Retry-After": String(wait) });

  // APIs authenticate themselves (key / secret / signature); they only get headers here.
  if (fam !== "page") return secure(NextResponse.next());

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login" && session) return secure(NextResponse.redirect(new URL("/", req.nextUrl)));
  if (pathname !== "/login" && !session) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", (pathname + search).slice(0, 300));
    return secure(NextResponse.redirect(url));
  }

  // Fresh nonce per request; Next.js reads it from the request's CSP header and stamps its scripts.
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  return secure(NextResponse.next({ request: { headers: requestHeaders } }), policy);
}

export const config = {
  // Everything except build assets and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)"],
};
