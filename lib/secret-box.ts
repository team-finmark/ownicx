import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serverSecret } from "./session";

// Encrypts credentials the manager enters in Settings (WhatsApp access token, app secret)
// before they are stored in Supabase. Key = SHA-256 of SESSION_SECRET with a purpose label,
// so rotating SESSION_SECRET means reconnecting WhatsApp.

function key() {
  const s = serverSecret();
  if (!s) throw new Error("SESSION_SECRET (32+ characters) is not configured");
  return createHash("sha256").update(`ownicx:whatsapp-credentials:${s}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

/** Returns null when the value can't be decrypted (e.g. SESSION_SECRET changed). */
export function open(sealed: string | null): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
