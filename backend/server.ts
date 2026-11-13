import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createApp } from "./app";
import { applySchema, databaseUrl } from "./db/pool";
import { loadEnv } from "./lib/env";
import { armIncrementalSchedule } from "./services/senate/run";
import { readScrapeState } from "./services/senate/store";
import { handlers } from "./workflow/handlers";
import { createPgRepository, seedPlan } from "./workflow/repository";
import { autorun, reconcileRunning } from "./workflow/runner";
import { PLAN_ID } from "./workflow/seed";

export const DEFAULT_BACKEND_PORT = 4000;

export async function startServer(port?: number): Promise<void> {
  loadEnv();
  const listenPort = port || Number(process.env.BACKEND_PORT) || DEFAULT_BACKEND_PORT;
  if (databaseUrl()) {
    await applySchema();
    await seedPlan();
    const repo = createPgRepository();
    const state = await readScrapeState();
    await reconcileRunning(repo, PLAN_ID, Boolean(state.backfillCompletedAt));
    const steps = await repo.listSteps(PLAN_ID);
    if (steps.some((step) => step.id === "incremental-6h" && step.status === "completed")) {
      armIncrementalSchedule();
    }
    if (process.env.WORKFLOW_AUTORUN === "true") {
      void autorun(repo, handlers, PLAN_ID).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
      });
    }
  }
  await listen(listenPort);
  console.log(`backend em http://127.0.0.1:${listenPort}`);
}

async function listen(port: number): Promise<void> {
  const app = createApp();
  const server = createServer((req, res) => {
    void handle(app, req, res, port);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

async function handle(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
): Promise<void> {
  try {
    const response = await app.fetch(await toRequest(req, port));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "erro" }));
  }
}

async function toRequest(req: IncomingMessage, port: number): Promise<Request> {
  const host = req.headers.host ?? `127.0.0.1:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  if (!body || method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  return new Request(url, { method, headers, body, duplex: "half" } as RequestInit);
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/backend/server.ts") || entry.endsWith("/backend/server.js")) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
