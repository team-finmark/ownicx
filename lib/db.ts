import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { cache } from "react";
import { DbError } from "./errors";
import { hashPasswordSync } from "./password";
import { buildSeed, type Db } from "./seed";
import type { TableName, Tables } from "./types";

// One data API for the whole app. With Supabase env vars set it reads/writes Supabase;
// without them it runs on an in-memory demo database (reset on server restart).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const isDemo = () => supabase() === null;

/** Demo-mode sign-in only. With Supabase connected, managers come from the `managers` table. */
export const DEMO_MANAGER = { name: "manager", password: "ownicx123" };

const g = globalThis as unknown as { __ownicxDb?: Db };
function memory(): Db {
  if (!g.__ownicxDb) {
    const seed = buildSeed();
    seed.managers.push({ id: "mgr_demo", name: DEMO_MANAGER.name, password_hash: hashPasswordSync(DEMO_MANAGER.password), created_at: new Date().toISOString(), last_login_at: null });
    g.__ownicxDb = seed;
  }
  return g.__ownicxDb;
}

export async function list<T extends TableName>(table: T): Promise<Tables[T][]> {
  await connection(); // always render with fresh data
  const sb = supabase();
  if (!sb) return structuredClone(memory()[table]) as Tables[T][];
  // PostgREST caps responses (1,000 rows by default), so page through.
  const PAGE = 1000;
  const out: Tables[T][] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").order("id").range(from, from + PAGE - 1);
    if (error) throw new DbError(`${table}: ${error.message}`);
    out.push(...(data as Tables[T][]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Filtered read: only the rows (and, on Supabase, only the work) a page actually needs. */
export interface Query {
  eq?: Record<string, string | number | boolean | null>;
  in?: Record<string, (string | number)[]>;
  gte?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  not?: Record<string, string | number | null>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

function matches(row: Record<string, unknown>, q: Query) {
  for (const [k, v] of Object.entries(q.eq ?? {})) if (row[k] !== v) return false;
  for (const [k, vs] of Object.entries(q.in ?? {})) if (!vs.includes(row[k] as string)) return false;
  const cmp = (a: unknown, b: unknown) => (typeof b === "string" && typeof a === "string" && /^\d{4}-\d\d-\d\dT/.test(b) ? Date.parse(a) - Date.parse(b) : (a as number) - (b as number));
  for (const [k, v] of Object.entries(q.gte ?? {})) if (row[k] === null || row[k] === undefined || cmp(row[k], v) < 0) return false;
  for (const [k, v] of Object.entries(q.lte ?? {})) if (row[k] === null || row[k] === undefined || cmp(row[k], v) > 0) return false;
  for (const [k, v] of Object.entries(q.not ?? {})) if (row[k] === v) return false;
  return true;
}

export async function query<T extends TableName>(table: T, q: Query = {}): Promise<Tables[T][]> {
  await connection();
  const sb = supabase();
  if (!sb) {
    let rows = (memory()[table] as unknown as Record<string, unknown>[]).filter((r) => matches(r, q));
    if (q.order) {
      const { column, ascending = true } = q.order;
      rows = [...rows].sort((a, b) => {
        const x = a[column], y = b[column];
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
        return ascending ? d : -d;
      });
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return structuredClone(rows) as unknown as Tables[T][];
  }
  const PAGE = 1000;
  const out: Tables[T][] = [];
  for (let from = 0; ; from += PAGE) {
    let r = sb.from(table).select("*");
    for (const [k, v] of Object.entries(q.eq ?? {})) r = v === null ? r.is(k, null) : r.eq(k, v as never);
    for (const [k, vs] of Object.entries(q.in ?? {})) r = r.in(k, vs as never[]);
    for (const [k, v] of Object.entries(q.gte ?? {})) r = r.gte(k, v as never);
    for (const [k, v] of Object.entries(q.lte ?? {})) r = r.lte(k, v as never);
    for (const [k, v] of Object.entries(q.not ?? {})) r = v === null ? r.not(k, "is", null) : r.neq(k, v as never);
    r = r.order(q.order?.column ?? "id", { ascending: q.order?.ascending ?? true });
    const size = q.limit ? Math.min(PAGE, q.limit - out.length) : PAGE;
    const { data, error } = await r.range(from, from + size - 1);
    if (error) throw new DbError(`${table}: ${error.message}`);
    out.push(...(data as Tables[T][]));
    if (!data || data.length < size || (q.limit && out.length >= q.limit)) break;
  }
  return out;
}

/** Row count without loading the rows. */
export async function count(table: TableName, q: Pick<Query, "eq" | "in" | "gte" | "lte" | "not"> = {}): Promise<number> {
  const sb = supabase();
  if (!sb) return (memory()[table] as unknown as Record<string, unknown>[]).filter((r) => matches(r, q)).length;
  let r = sb.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(q.eq ?? {})) r = v === null ? r.is(k, null) : r.eq(k, v as never);
  for (const [k, vs] of Object.entries(q.in ?? {})) r = r.in(k, vs as never[]);
  for (const [k, v] of Object.entries(q.gte ?? {})) r = r.gte(k, v as never);
  for (const [k, v] of Object.entries(q.lte ?? {})) r = r.lte(k, v as never);
  for (const [k, v] of Object.entries(q.not ?? {})) r = v === null ? r.not(k, "is", null) : r.neq(k, v as never);
  const { count: n, error } = await r;
  if (error) throw new DbError(`${table}: ${error.message}`);
  return n ?? 0;
}

/** Fetches rows whose `column` is in `values`, in chunks (URLs have a length limit). */
export async function queryIn<T extends TableName>(table: T, column: string, values: string[], extra: Query = {}): Promise<Tables[T][]> {
  const uniq = [...new Set(values)];
  const out: Tables[T][] = [];
  for (let i = 0; i < uniq.length; i += 150) out.push(...(await query(table, { ...extra, in: { ...(extra.in ?? {}), [column]: uniq.slice(i, i + 150) } })));
  return out;
}

export async function get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null> {
  const sb = supabase();
  if (!sb) {
    const row = (memory()[table] as Tables[T][]).find((r) => (r as { id: string }).id === id);
    return row ? structuredClone(row) : null;
  }
  const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new DbError(`${table}: ${error.message}`);
  return data as Tables[T] | null;
}

export async function insert<T extends TableName>(table: T, rows: Tables[T] | Tables[T][]): Promise<void> {
  const arr = Array.isArray(rows) ? rows : [rows];
  if (arr.length === 0) return;
  const sb = supabase();
  if (!sb) {
    (memory()[table] as Tables[T][]).push(...structuredClone(arr));
    return;
  }
  const { error } = await sb.from(table).insert(arr as never);
  if (error) throw new DbError(`${table}: ${error.message}`);
}

export async function update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void> {
  const sb = supabase();
  if (!sb) {
    const row = (memory()[table] as Tables[T][]).find((r) => (r as { id: string }).id === id);
    if (!row) throw new Error(`${table}: ${id} not found`);
    Object.assign(row as object, structuredClone(patch));
    return;
  }
  const { error } = await sb.from(table).update(patch as never).eq("id", id);
  if (error) throw new DbError(`${table}: ${error.message}`);
}

/**
 * Compare-and-set: applies `patch` only if the row still has the `expected` values.
 * Returns false when another request changed the row first (the caller re-reads and retries).
 */
export async function updateIf<T extends TableName>(table: T, id: string, expected: Partial<Tables[T]>, patch: Partial<Tables[T]>): Promise<boolean> {
  const sb = supabase();
  if (!sb) {
    const row = (memory()[table] as Tables[T][]).find((r) => (r as { id: string }).id === id) as Record<string, unknown> | undefined;
    if (!row) return false;
    for (const [k, v] of Object.entries(expected)) if (row[k] !== v) return false;
    Object.assign(row, structuredClone(patch));
    return true;
  }
  let q = sb.from(table).update(patch as never).eq("id", id);
  for (const [k, v] of Object.entries(expected)) if (v !== undefined) q = v === null ? q.is(k, null) : q.eq(k, v as never);
  const { data, error } = await q.select("id");
  if (error) throw new DbError(`${table}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function remove(table: TableName, id: string): Promise<void> {
  const sb = supabase();
  if (!sb) {
    const rows = memory()[table] as { id: string }[];
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
    return;
  }
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw new DbError(`${table}: ${error.message}`);
}

/** Salon settings. Memoised per page render, so the layout and the page share one fetch. */
export const getSettings = cache(async () => {
  const rows = await list("settings");
  if (!rows[0]) throw new DbError("settings row missing — run supabase/seed.sql");
  return rows[0];
});

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
