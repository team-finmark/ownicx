// Signed session cookie (HMAC-SHA256 via Web Crypto, so it runs in proxy.ts and on the server).
// No server-only import: proxy.ts needs verifySession.

// "__Host-" makes the browser refuse the cookie unless it is Secure, path=/ and has no Domain —
// so no other site or subdomain can set or overwrite it. Needs HTTPS, so plain name in local dev.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ownicx_session" : "ownicx_session";
export const SESSION_TTL_S = 12 * 60 * 60; // one working day

export interface SessionPayload {
  sub: string; // manager id
  pv: string; // password fingerprint — changing the password invalidates every other session
  name: string;
  exp: number; // unix seconds
}

const isDemoEnv = () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // A fixed key is acceptable only while running on throwaway demo data.
  return isDemoEnv() ? "ownicx-demo-only-session-secret-do-not-use-in-production" : null;
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(s: string) {
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Server secret, also used to derive the key that encrypts stored WhatsApp tokens. */
export function serverSecret(): string | null {
  return secret();
}

export function sessionSecretMissing() {
  return secret() === null;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET (32+ characters) is not configured");
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(s), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  const s = secret();
  if (!token || !s) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(s), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
