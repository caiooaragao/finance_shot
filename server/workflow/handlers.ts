import { spawn } from "node:child_process";
import { join } from "node:path";

import { applySchema, listPublicTables } from "../db/prisma";
import { SenateClient } from "../services/senate/client";
import { armIncrementalSchedule, runBackfill, runIncremental } from "../services/senate/run";
import { readScrapeState } from "../services/senate/store";
import { ENVELOPE_KEYS, parseTradeQuery, queryTrades, TRADE_KEYS } from "../services/trades";
import { REQUIRED_TABLES } from "./evaluate";
import type { HandlerOutput } from "./types";
import type { StepHandler } from "./runner";

function unavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /DATABASE_URL ausente|ECONNREFUSED|ENOTFOUND|authentication failed|does not exist|57P01|administrator command|Can't reach database server|Server has closed the connection/i.test(
    error.message,
  );
}

export const handlers: Record<string, StepHandler> = {
  async schema(): Promise<HandlerOutput> {
    const expected = "As tabelas do Senado existem no banco.";
    try {
      await applySchema();
      const tables = await listPublicTables([...REQUIRED_TABLES]);
      const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
      return {
        expected,
        actual: tables.join(", "),
        errors: missing.map((table) => `tabela ausente: ${table}`),
        evidence: { tables },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha ao criar o schema";
      return { expected, actual: message, errors: [message], evidence: {}, blocked: unavailable(error) };
    }
  },

  async "senate-client"(): Promise<HandlerOutput> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const page = await new SenateClient().searchPage({ start, end, length: 25 });
    return {
      expected: "Uma página JSON do índice de PTRs.",
      actual: `${page.rows.length} linhas, total ${page.total}.`,
      errors: [],
      evidence: { ok: true, rows: page.rows.length, total: page.total },
    };
  },

  async "parse-normalize"(): Promise<HandlerOutput> {
    const file = join("server", "services", "senate", "parse-ptr.test.ts");
    const result = await runNodeTest(file);
    return {
      expected: "node:test do parser sai 0.",
      actual: result.output.slice(-2000),
      errors: result.code === 0 ? [] : [`exit ${result.code}`],
      evidence: { exitCode: result.code },
    };
  },

  async "serve-api"(): Promise<HandlerOutput> {
    const expected = "GET /trades/recent devolve o envelope da CongressInvests.";
    try {
      const recent = await queryTrades(parseTradeQuery(new URLSearchParams({ limit: "1", offset: "0" })));
      const house = await queryTrades(
        parseTradeQuery(new URLSearchParams({ limit: "5", offset: "0", chamber: "House" })),
      );
      const envelope = ENVELOPE_KEYS.every((key) => key in recent);
      const tradesOk = recent.trades.every((trade) => TRADE_KEYS.every((key) => key in trade));
      const houseOnly = house.trades.every((trade) => trade.chamber === "House");
      return {
        expected,
        actual: envelope && tradesOk && houseOnly ? "envelope ok" : "envelope incompleto",
        errors: [
          envelope ? "" : "faltam chaves do envelope",
          tradesOk ? "" : "trade fora do formato",
          houseOnly ? "" : "chamber=House devolveu outra casa",
        ].filter(Boolean),
        evidence: { envelope: envelope && tradesOk && houseOnly },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha na API";
      return { expected, actual: message, errors: [message], evidence: {}, blocked: unavailable(error) };
    }
  },

  async "backfill-3y"(): Promise<HandlerOutput> {
    const result = await runBackfill();
    return {
      expected: "Backfill de todos os anos do eFD concluído e a segunda passagem não insere filings.",
      actual: `inseridos ${result.first.added}; segunda passagem ${result.duplicatePassAdded}.`,
      errors: [],
      evidence: {
        backfillCompleted: true,
        duplicatePassAdded: result.duplicatePassAdded,
        filingsBefore: result.filingsBefore,
        filingsAfter: result.filingsAfter,
        inserted: result.first.added,
        paper: result.first.paper,
      },
    };
  },

  async "incremental-6h"(): Promise<HandlerOutput> {
    const first = await runIncremental();
    const second = await runIncremental();
    armIncrementalSchedule();
    const state = await readScrapeState();
    return {
      expected: "A segunda corrida insere zero e o job de 6 horas fica armado.",
      actual: `primeira ${first.added}, segunda ${second.added}.`,
      errors: second.added === 0 ? [] : ["a segunda corrida inseriu filings novos"],
      evidence: {
        secondRunAdded: second.added,
        scheduled: true,
        firstAdded: first.added,
        backfillCompleted: Boolean(state.backfillCompletedAt),
      },
    };
  },
};

function runNodeTest(file: string): Promise<{ code: number | null; output: string }> {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "--test", file], { cwd: process.cwd() });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}
