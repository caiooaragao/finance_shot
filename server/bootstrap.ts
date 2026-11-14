import { applySchema, databaseUrl } from "./db/prisma";
import { readEnv } from "./lib/env";
import { processSlot } from "./lib/singleton";
import { armIncrementalSchedule } from "./services/senate/run";
import { readScrapeState } from "./services/senate/store";
import { handlers } from "./workflow/handlers";
import { getWorkflowRepository, hydrateCompleted } from "./workflow/repository";
import { autorun, reconcileRunning } from "./workflow/runner";
import { PLAN_ID } from "./workflow/seed";

const pending = processSlot<Promise<void> | undefined>("finance-shot.bootstrap", undefined);

/** Prepara schema, workflow e o job de 6 horas no processo do Next.js. */
export function bootstrap(): Promise<void> {
  if (!pending.value) {
    pending.value = run().catch((error: unknown) => {
      pending.value = undefined;
      console.error(error instanceof Error ? error.message : error);
    });
  }
  return pending.value;
}

async function run(): Promise<void> {
  if (!databaseUrl()) return;

  await applySchema();
  const repo = getWorkflowRepository();
  const state = await readScrapeState();
  hydrateCompleted(PLAN_ID, Boolean(state.backfillCompletedAt));
  await reconcileRunning(repo, PLAN_ID, Boolean(state.backfillCompletedAt));
  const steps = await repo.listSteps(PLAN_ID);
  if (steps.some((step) => step.id === "incremental-6h" && step.status === "completed")) {
    armIncrementalSchedule();
  }
  if (readEnv("WORKFLOW_AUTORUN") === "true") {
    void autorun(repo, handlers, PLAN_ID).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }
}
