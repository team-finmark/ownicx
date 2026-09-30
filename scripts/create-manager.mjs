// Create a manager, or reset an existing manager's password, in Supabase.
// Usage:  npm run manager -- "Priya" "NewPassword1"
import { randomBytes, scryptSync } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [name, password] = process.argv.slice(2);
if (!name || !password) {
  console.error('Usage: npm run manager -- "Name" "Password1"');
  process.exit(1);
}
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("Password must be 8+ characters with letters and at least one number.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or .env.local) first.");
  process.exit(1);
}

// Same format as lib/password.ts
const N = 16384;
const salt = randomBytes(16);
const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N, r: 8, p: 1 });
const password_hash = `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("managers").select("id, name");
if (error) {
  console.error(`Supabase error: ${error.message}\nHave you run supabase/schema.sql?`);
  process.exit(1);
}
const existing = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
const res = existing
  ? await sb.from("managers").update({ password_hash }).eq("id", existing.id)
  : await sb.from("managers").insert({ id: `mgr_${randomBytes(6).toString("hex")}`, name, password_hash });
if (res.error) {
  console.error(`Supabase error: ${res.error.message}`);
  process.exit(1);
}
console.log(existing ? `Password reset for "${existing.name}".` : `Manager "${name}" created. They can sign in now.`);
