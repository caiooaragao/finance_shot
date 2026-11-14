import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { readEnv } from "../lib/env";
import { processSlot } from "../lib/singleton";

const prismaSlot = processSlot<PrismaClient | undefined>("finance-shot.prisma", undefined);

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

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return getPrisma().$queryRawUnsafe<T[]>(sql, ...params);
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  return getPrisma().$executeRawUnsafe(sql, ...params);
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
  const rows = await getPrisma().$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(names)})
    ORDER BY table_name`;
  return rows.map((row) => row.table_name);
}

export async function disconnectPrisma(): Promise<void> {
  if (!prismaSlot.value) return;
  const current = prismaSlot.value;
  prismaSlot.value = undefined;
  await current.$disconnect();
}
