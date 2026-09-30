import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import * as db from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

/** The signed-in manager, or null. The session is re-checked against the managers table on every request. */
export const getManager = cache(async () => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const manager = await db.get("managers", session.sub);
  return manager ? { id: manager.id, name: manager.name } : null;
});

/** Use at the top of every protected page, layout and server action. */
export async function requireManager() {
  const m = await getManager();
  if (!m) redirect("/login");
  return m;
}

// Brute-force brake, stored in the database so it survives restarts and is shared by every
// server instance (Vercel runs several). Two counters:
//  - per manager name, regardless of IP (so rotating or faking X-Forwarded-For doesn't help): 10 fails / 15 min
//  - per IP, across names (so one address can't spray many names): 20 fails / 15 min
const WINDOW_MS = 15 * 60_000;
export const LIMITS = { name: 10, ip: 20 };
const keyId = (key: string) => key.slice(0, 200);

export async function loginLocked(key: string, limit: number) {
  const a = await db.get("login_attempts", keyId(key));
  return !!a && a.n >= limit && Date.parse(a.until) > Date.now();
}
export async function loginFailed(key: string) {
  const id = keyId(key);
  const until = new Date(Date.now() + WINDOW_MS).toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const a = await db.get("login_attempts", id);
    if (!a) {
      try {
        await db.insert("login_attempts", { id, n: 1, until });
        return;
      } catch {
        continue; // another request created it first
      }
    }
    const fresh = Date.parse(a.until) < Date.now();
    if (await db.updateIf("login_attempts", id, { n: a.n }, { n: fresh ? 1 : a.n + 1, until })) return;
  }
}
export async function loginSucceeded(key: string) {
  await db.remove("login_attempts", keyId(key));
}
