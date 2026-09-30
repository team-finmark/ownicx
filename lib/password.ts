import "server-only";
import { randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Format: scrypt$<N>$<saltB64>$<hashB64>. Same format as scripts/create-manager.mjs.
const N = 16384;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Sync variant, used only to seed the in-memory demo manager. */
export function hashPasswordSync(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: 8, p: 1 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblem(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letters and at least one number";
  return null;
}
