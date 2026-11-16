import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { readEnv } from "../lib/env";
import { processSlot } from "../lib/singleton";

const prismaSlot = processSlot<PrismaClient | undefined>("finance-shot.prisma", undefined);
const TRANSIENT_PG = new Set(["57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "57P05"]);

/** Postgres encerrou a sessão (restart, `compose down`, admin) — a query em si não falhou. */
export function isTransientDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1001" || error.code === "P1017") return true;
    if (error.code === "P2010") {
      const code = error.meta?.code;
      if (typeof code === "string" && TRANSIENT_PG.has(code)) return true;
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  const message = error instanceof Error ? error.message : "";
  return /57P01|terminating connection due to administrator command|Server has closed the connection|Can't reach database server|ECONNRESET|ECONNREFUSED|EPIPE/i.test(
    message,
  );
}

export function databaseUrl(): string | undefined {
  return readEnv("DATABASE_URL");
}

export function getPrisma(): PrismaClient {
  const url = databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL ausente");
  }
  if (!prismaSlot.value) {
    prismaSlot.value = new PrismaClient({ datasources: { db: { url } } });
  }
  return prismaSlot.value;
}

let recovering: Promise<void> | null = null;

function recoverClient(): Promise<void> {
  if (!recovering) {
    recovering = disconnectPrisma().finally(() => {
      recovering = null;
    });
  }
  return recovering;
}

async function withDb<T>(run: (db: PrismaClient) => Promise<T>): Promise<T> {
  try {
    return await run(getPrisma());
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    await recoverClient();
    return await run(getPrisma());
  }
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withDb((db) => db.$queryRawUnsafe<T[]>(sql, ...params));
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  return withDb((db) => db.$executeRawUnsafe(sql, ...params));
}

export async function applySchema(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "server", "db", "schema.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await execute(statement);
  }
}

export async function listPublicTables(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await withDb((db) =>
    db.$queryRaw<{ table_name: string }[]>(
      Prisma.sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(names)})
    ORDER BY table_name`,
    ),
  );
  return rows.map((row) => row.table_name);
}

export async function disconnectPrisma(): Promise<void> {
  if (!prismaSlot.value) return;
  const current = prismaSlot.value;
  prismaSlot.value = undefined;
  await current.$disconnect();
}
