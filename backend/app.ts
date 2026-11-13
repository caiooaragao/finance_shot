import { Hono } from "hono";

import { getPool } from "./db/pool";
import { runIncremental } from "./services/senate/run";
import { readScrapeState } from "./services/senate/store";
import { loadHealth, parseTradeQuery, queryTrades } from "./services/trades";
import { handlers } from "./workflow/handlers";
import { createPgRepository } from "./workflow/repository";
import { dependenciesDone, tick } from "./workflow/runner";
import { PLAN_ID } from "./workflow/seed";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "banco indisponível";
}

export function createApp(): Hono {
  const app = new Hono();
  const repo = createPgRepository();

  app.get("/health", async (c) => {
    if (!process.env.DATABASE_URL) {
      return c.json({
        data_current: false,
        cache_loading: false,
        last_updated: null,
        data_lag_minutes: null,
        next_refresh_in_minutes: 360,
        filings: 0,
        trades: 0,
        last_error: "DATABASE_URL ausente",
        backfill_completed: false,
      });
    }
    try {
      return c.json(await loadHealth());
    } catch (error) {
      return c.json({
        data_current: false,
        cache_loading: false,
        last_updated: null,
        data_lag_minutes: null,
        next_refresh_in_minutes: 360,
        filings: 0,
        trades: 0,
        last_error: message(error),
        backfill_completed: false,
      });
    }
  });

  app.get("/trades/recent", async (c) => {
    try {
      const url = new URL(c.req.url);
      return c.json(await queryTrades(parseTradeQuery(url.searchParams)));
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.get("/trades/:ticker", async (c) => {
    try {
      const url = new URL(c.req.url);
      return c.json(await queryTrades(parseTradeQuery(url.searchParams, c.req.param("ticker"))));
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.get("/trades", async (c) => {
    try {
      const url = new URL(c.req.url);
      return c.json(await queryTrades(parseTradeQuery(url.searchParams)));
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.get("/workflow", async (c) => {
    try {
      const steps = await repo.listSteps(PLAN_ID);
      const feedback = await repo.latestFeedback(PLAN_ID);
      const plan = await getPool().query<{
        id: string;
        title: string;
        status: string;
        version: number;
        parent_plan_id: string | null;
      }>("SELECT id, title, status, version, parent_plan_id FROM workflow_plans WHERE id = $1", [PLAN_ID]);
      const counts = { pending: 0, running: 0, completed: 0, blocked: 0, failed: 0, cancelled: 0 };
      for (const step of steps) counts[step.status] += 1;
      const current = steps.find((step) => step.status === "running")
        ?? steps.find((step) => step.status === "pending" && dependenciesDone(steps, step))
        ?? null;
      return c.json({
        plan: plan.rows[0] ?? { id: PLAN_ID },
        counts,
        current: current?.id ?? null,
        steps: steps.map((step) => ({ ...step, feedback: feedback.get(step.id) ?? null })),
      });
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.post("/workflow/tick", async (c) => {
    try {
      return c.json(await tick(repo, handlers, PLAN_ID));
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.post("/workflow/retry", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({} as { stepId?: string }));
      if (!body.stepId) return c.json({ error: "stepId obrigatório" }, 400);
      const reopened = await repo.reopen(PLAN_ID, body.stepId);
      if (!reopened) return c.json({ error: "etapa não está blocked ou failed" }, 409);
      return c.json({ stepId: body.stepId, status: "pending" });
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  app.post("/scrape", async (c) => {
    try {
      const state = await readScrapeState();
      if (!state.backfillCompletedAt) {
        const result = await tick(repo, handlers, PLAN_ID);
        return c.json({ mode: "workflow", ...result });
      }
      const progress = await runIncremental();
      return c.json({ mode: "incremental", ...progress });
    } catch (error) {
      return c.json({ error: message(error) }, 503);
    }
  });

  return app;
}
