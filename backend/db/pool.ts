import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const DATE_OID = 1082;

let pool: pg.Pool | undefined;

export function databaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : undefined;
}

export function getPool(): pg.Pool {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente");
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString });
    pg.types.setTypeParser(DATE_OID, (value) => value);
  }
  return pool;
}

export async function applySchema(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "backend", "db", "schema.sql"), "utf8");
  await getPool().query(sql);
}

export async function listPublicTables(names: string[]): Promise<string[]> {
  const result = await getPool().query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [names],
  );
  return result.rows.map((row) => row.table_name);
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
