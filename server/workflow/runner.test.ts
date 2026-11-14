import assert from "node:assert/strict";
import test from "node:test";

import { decide } from "./evaluate";
import { tick, type StepHandler } from "./runner";
import type { FeedbackInput, FeedbackRecord, PlanRecord, StepRecord, WorkflowRepository } from "./types";

test("decide cobre aprovação, retry, bloqueio, falha e replanejamento", () => {
  assert.equal(decide({ met: true, blocked: false, replan: false, attempts: 1, maxAttempts: 3 }), "APPROVED");
  assert.equal(decide({ met: false, blocked: false, replan: false, attempts: 1, maxAttempts: 3 }), "RETRY");
  assert.equal(decide({ met: false, blocked: true, replan: false, attempts: 3, maxAttempts: 3 }), "BLOCKED");
  assert.equal(decide({ met: false, blocked: false, replan: false, attempts: 3, maxAttempts: 3 }), "FAILED");
  assert.equal(decide({ met: true, blocked: false, replan: true, attempts: 1, maxAttempts: 3 }), "REPLAN");
});

test("dois ticks não executam a mesma etapa", async () => {
  const repo = new MemoryRepo();
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handlers: Record<string, StepHandler> = {
    schema: async () => {
      calls += 1;
      await gate;
      return {
        expected: "tabelas",
        actual: "ok",
        evidence: {
          tables: [
            "senate_filings",
            "senate_trades",
            "house_filings",
            "house_trades",
            "scrape_state",
          ],
        },
      };
    },
  };

  const first = tick(repo, handlers, "senate-efd");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await tick(repo, handlers, "senate-efd");
  release();
  const done = await first;

  assert.equal(second.message, "já existe uma etapa em execução neste processo");
  assert.equal(done.decision, "APPROVED");
  assert.equal(calls, 1);
  assert.equal(repo.steps[0]?.status, "completed");
  assert.equal(repo.steps[0]?.attempts, 1);

  const third = await tick(repo, handlers, "senate-efd");
  assert.equal(third.decision, null);
  assert.equal(calls, 1);
});

class MemoryRepo implements WorkflowRepository {
  getPlan(): Promise<PlanRecord> {
    return Promise.resolve({
      id: "senate-efd",
      title: "Scrape de PTRs do Senado",
      status: "active",
      version: 1,
      parentPlanId: null,
    });
  }

  steps: StepRecord[] = [
    {
      id: "schema",
      planId: "senate-efd",
      position: 10,
      title: "Schema",
      description: "",
      objective: "tabelas",
      status: "pending",
      acceptanceCriteria: [],
      dependencies: [],
      complexity: "low",
      tools: [],
      risks: [],
      handler: "schema",
      attempts: 0,
      maxAttempts: 3,
      result: null,
      startedAt: null,
      completedAt: null,
    },
  ];

  feedback: FeedbackInput[] = [];
  private queue: Promise<void> = Promise.resolve();

  listSteps(): Promise<StepRecord[]> {
    return Promise.resolve(this.steps.map((step) => ({ ...step })));
  }

  claim(_planId: string, stepId: string): Promise<StepRecord | null> {
    const run = this.queue.then(() => {
      const step = this.steps.find((item) => item.id === stepId);
      if (!step || step.status !== "pending") return null;
      step.status = "running";
      step.attempts += 1;
      step.startedAt = new Date().toISOString();
      return { ...step };
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  applyStatus(_planId: string, stepId: string, status: StepRecord["status"], result: unknown): Promise<void> {
    const step = this.steps.find((item) => item.id === stepId);
    if (step) {
      step.status = status;
      step.result = result;
      step.completedAt = status === "completed" ? new Date().toISOString() : null;
    }
    return Promise.resolve();
  }

  addFeedback(input: FeedbackInput): Promise<void> {
    this.feedback.push(input);
    return Promise.resolve();
  }

  latestFeedback(): Promise<Map<string, FeedbackRecord>> {
    return Promise.resolve(new Map());
  }

  replan(): Promise<void> {
    return Promise.resolve();
  }

  reopen(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
