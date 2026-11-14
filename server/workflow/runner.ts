import { randomUUID } from "node:crypto";

import { processSlot } from "../lib/singleton";
import { criteriaMet, judge, statusFor } from "./evaluate";
import type { Decision, HandlerOutput, StepRecord, WorkflowRepository } from "./types";

export type StepHandler = (step: StepRecord) => Promise<HandlerOutput>;

export type TickResult = {
  stepId: string | null;
  decision: Decision | null;
  message: string;
  reason?: string;
  nextAction?: string;
};

const execution = processSlot("finance-shot.workflow.inProcess", false);

function ready(steps: StepRecord[]): StepRecord | undefined {
  const completed = new Set(steps.filter((step) => step.status === "completed").map((step) => step.id));
  return steps
    .filter((step) => step.status === "pending" && step.dependencies.every((id) => completed.has(id)))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))[0];
}

export async function tick(
  repo: WorkflowRepository,
  handlers: Record<string, StepHandler>,
  planId: string,
): Promise<TickResult> {
  if (execution.value) {
    return { stepId: null, decision: null, message: "já existe uma etapa em execução neste processo" };
  }
  execution.value = true;
  try {
    const steps = await repo.listSteps(planId);
    const running = steps.find((step) => step.status === "running");
    if (running) return await execute(repo, handlers, running);
    const next = ready(steps);
    if (!next) return { stepId: null, decision: null, message: "nenhuma etapa executável" };
    const claimed = await repo.claim(planId, next.id);
    if (!claimed) return { stepId: next.id, decision: null, message: "etapa já reivindicada" };
    return await execute(repo, handlers, claimed);
  } finally {
    execution.value = false;
  }
}

async function execute(
  repo: WorkflowRepository,
  handlers: Record<string, StepHandler>,
  step: StepRecord,
): Promise<TickResult> {
  const handler = handlers[step.handler];
  let output: HandlerOutput;
  if (!handler) {
    output = {
      expected: step.objective,
      actual: `Handler ausente: ${step.handler}`,
      errors: [`handler ${step.handler} não registrado`],
      evidence: {},
    };
  } else {
    try {
      output = await handler(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha na etapa";
      const blocked = error instanceof Error && error.name === "SenateBlockedError";
      const shape = error instanceof Error && error.name === "SenateShapeError";
      output = {
        expected: step.objective,
        actual: message,
        errors: [message],
        evidence: {},
        blocked,
        replan: shape ? replacement(step, message) : undefined,
      };
    }
  }

  let judgment = judge(step, output);
  if (judgment.decision === "REPLAN" && output.replan) {
    const steps = await repo.listSteps(step.planId);
    const siblings = steps.filter((item) => item.handler === step.handler).length;
    if (siblings >= 2) {
      judgment = {
        ...judgment,
        decision: "FAILED",
        reason: "O índice continua fora do formato esperado depois do replanejamento.",
        nextAction: "Etapa encerrada depois do limite de tentativas.",
      };
    } else {
      await repo.replan(step.planId, output.replan);
    }
  }

  const status = statusFor(judgment.decision);
  await repo.applyStatus(step.planId, step.id, status, {
    actual: output.actual,
    evidence: output.evidence ?? {},
  });
  await repo.addFeedback({
    planId: step.planId,
    stepId: step.id,
    expected: judgment.expected,
    actual: judgment.actual,
    errors: judgment.errors,
    evidence: judgment.evidence,
    decision: judgment.decision,
    reason: judgment.reason,
    nextAction: judgment.nextAction,
  });

  return {
    stepId: step.id,
    decision: judgment.decision,
    message: judgment.reason,
    reason: judgment.reason,
    nextAction: judgment.nextAction,
  };
}

function replacement(step: StepRecord, reason: string): NonNullable<HandlerOutput["replan"]> {
  const id = `${step.handler}-${randomUUID().slice(0, 8)}`;
  return {
    reason,
    cancel: [],
    retarget: [{ from: step.id, to: id }],
    add: [
      {
        id,
        position: step.position + 1,
        title: `${step.title} revisado`,
        description: "Etapa criada porque a resposta do eFD mudou de formato.",
        objective: step.objective,
        acceptanceCriteria: step.acceptanceCriteria,
        dependencies: step.dependencies,
        complexity: step.complexity,
        tools: step.tools,
        risks: step.risks,
        handler: step.handler,
        maxAttempts: step.maxAttempts,
      },
    ],
  };
}

export async function reconcileRunning(
  repo: WorkflowRepository,
  planId: string,
  backfillDone: boolean,
): Promise<void> {
  const steps = await repo.listSteps(planId);
  for (const step of steps) {
    if (step.status !== "running") continue;
    if (step.handler === "backfill-3y" && !backfillDone) continue;
    const previous = (step.result ?? {}) as { evidence?: Record<string, unknown>; actual?: string };
    const output: HandlerOutput = {
      expected: step.objective,
      actual: previous.actual ?? "processo interrompido",
      evidence: previous.evidence ?? {},
    };
    const met = step.handler === "backfill-3y" ? backfillDone : criteriaMet(step, output);
    if (met) {
      await repo.applyStatus(step.planId, step.id, "completed", previous);
      await repo.addFeedback({
        planId: step.planId,
        stepId: step.id,
        expected: step.objective,
        actual: "Evidência já presente na retomada.",
        errors: [],
        evidence: output.evidence ?? {},
        decision: "APPROVED",
        reason: "Critérios de aceitação confirmados pela evidência.",
        nextAction: "Avançar para a próxima etapa executável.",
      });
      continue;
    }
    const status = step.attempts >= step.maxAttempts ? "failed" : "pending";
    await repo.applyStatus(step.planId, step.id, status, previous);
    await repo.addFeedback({
      planId: step.planId,
      stepId: step.id,
      expected: step.objective,
      actual: "A etapa estava running quando o processo caiu.",
      errors: ["execução interrompida"],
      evidence: {},
      decision: status === "failed" ? "FAILED" : "RETRY",
      reason: status === "failed" ? "Tentativas esgotadas sem cumprir os critérios." : "Retomar a etapa interrompida.",
      nextAction: status === "failed"
        ? "Etapa encerrada depois do limite de tentativas."
        : "Executar a etapa de novo.",
    });
  }
}

export async function autorun(
  repo: WorkflowRepository,
  handlers: Record<string, StepHandler>,
  planId: string,
): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const result = await tick(repo, handlers, planId);
    if (result.decision === "APPROVED") continue;
    if (result.decision === "BLOCKED") {
      const steps = await repo.listSteps(planId);
      if (ready(steps)) continue;
    }
    break;
  }
}

export function dependenciesDone(steps: StepRecord[], step: StepRecord): boolean {
  const completed = new Set(steps.filter((item) => item.status === "completed").map((item) => item.id));
  return step.dependencies.every((id) => completed.has(id));
}
