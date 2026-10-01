"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LIMITS, loginFailed, loginLocked, loginSucceeded, requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { gateFail, gateStatus } from "@/lib/gate";
import { hashPassword, passwordFingerprint, passwordProblem, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_TTL_S, sessionSecretMissing, signSession } from "@/lib/session";
import type { ActionState } from "./actions";

/** Signed, HttpOnly, SameSite=Strict session cookie bound to the current password. */
async function setSessionCookie(id: string, name: string, passwordHash: string) {
  const token = await signSession({ sub: id, name, pv: passwordFingerprint(passwordHash), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

// Verifying against a throwaway hash when the name is unknown keeps response time the same,
// so the form doesn't reveal which manager names exist.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

export async function signIn(_: ActionState, f: FormData): Promise<ActionState> {
  const name = String(f.get("name") ?? "").trim();
  const password = String(f.get("password") ?? "");
  const next = String(f.get("next") ?? "/");
  if (!name || !password) return { ok: false, message: "Enter your name and password" };
  if (sessionSecretMissing()) return { ok: false, message: "Sign-in is disabled: set SESSION_SECRET (32+ characters) in the environment" };

  if (name.length > 100 || password.length > 200) return { ok: false, message: "Name or password is incorrect" };
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
  // Two locks: per manager name (any IP — faking addresses doesn't help) and the escalating per-IP login gate.
  const nameKey = `name:${name.toLowerCase()}`;
  const ipGate = await gateStatus("login", ip);
  if (ipGate.locked || (await loginLocked(nameKey, LIMITS.name))) return { ok: false, message: "Too many attempts. Try again later." };

  let manager;
  try {
    manager = (await db.list("managers")).find((m) => m.name.toLowerCase() === name.toLowerCase());
  } catch {
    return { ok: false, message: "Can't reach the database. Has supabase/schema.sql been run (managers table)?" };
  }
  const ok = await verifyPassword(password, manager?.password_hash ?? (await dummy()));
  if (!manager || !ok) {
    await Promise.all([loginFailed(nameKey), gateFail("login", ip)]);
    return { ok: false, message: "Name or password is incorrect" };
  }
  await loginSucceeded(nameKey);
  await db.update("managers", manager.id, { last_login_at: new Date().toISOString() });

  await setSessionCookie(manager.id, manager.name, manager.password_hash);
  // Only allow same-site relative redirects after sign-in.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireManager();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  const confirm = String(f.get("confirm") ?? "");
  const row = await db.get("managers", me.id);
  if (!row || !(await verifyPassword(current, row.password_hash))) return { ok: false, message: "Current password is incorrect" };
  if (next !== confirm) return { ok: false, message: "New passwords don't match" };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, message: problem };
  const hash = await hashPassword(next);
  await db.update("managers", me.id, { password_hash: hash });
  // Every other device is now signed out (their sessions carry the old fingerprint); keep this one.
  await setSessionCookie(me.id, me.name, hash);
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}
