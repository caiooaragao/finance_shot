import { processSlot } from "../lib/singleton";
import { PLAN, PLAN_ID, senateSteps } from "./seed";
import type {
  FeedbackInput,
  FeedbackRecord,
  PlanRecord,
  ReplanChange,
  StepDraft,
  StepRecord,
  StepStatus,
  WorkflowRepository,
} from "./types";

type PlanState = {
  title: string;
  status: string;
  version: number;
  parentPlanId: string | null;
  steps: StepRecord[];
  feedback: FeedbackRecord[];
};

const plans = processSlot<Map<string, PlanState>>("finance-shot.workflow.plans", new Map()).value;
const queue = processSlot<Promise<void>>("finance-shot.workflow.queue", Promise.resolve());
let repo: WorkflowRepository | undefined;

function fromDraft(planId: string, step: StepDraft): StepRecord {
  return {
    id: step.id,
    planId,
    position: step.position,
    title: step.title,
    description: step.description,
    objective: step.objective,
    status: "pending",
    acceptanceCriteria: step.acceptanceCriteria,
    dependencies: step.dependencies,
    complexity: step.complexity,
    tools: step.tools,
    risks: step.risks,
    handler: step.handler,
    attempts: 0,
    maxAttempts: step.maxAttempts,
    result: null,
    startedAt: null,
    completedAt: null,
  };
}

function ensurePlan(planId: string): PlanState {
  let state = plans.get(planId);
  if (!state) {
    state = {
      title: PLAN.title,
      status: PLAN.status,
      version: PLAN.version,
      parentPlanId: PLAN.parentPlanId,
      steps: senateSteps().map((step) => fromDraft(planId, step)),
      feedback: [],
    };
    plans.set(planId, state);
  }
  return state;
}

function cloneStep(step: StepRecord): StepRecord {
  return { ...step, acceptanceCriteria: [...step.acceptanceCriteria], dependencies: [...step.dependencies], tools: [...step.tools], risks: [...step.risks] };
}

function serialized<T>(work: () => T | Promise<T>): Promise<T> {
  const run = queue.value.then(work, work);
  queue.value = run.then(() => undefined, () => undefined);
  return run;
}

export function createMemoryRepository(): WorkflowRepository {
  return {
    async getPlan(planId) {
      const state = ensurePlan(planId);
      return {
        id: planId,
        title: state.title,
        status: state.status,
        version: state.version,
        parentPlanId: state.parentPlanId,
      };
    },
    async listSteps(planId) {
      return ensurePlan(planId).steps.map(cloneStep);
    },
    async claim(planId, stepId) {
      return serialized(() => {
        const step = ensurePlan(planId).steps.find((item) => item.id === stepId);
        if (!step || step.status !== "pending") return null;
        step.status = "running";
        step.attempts += 1;
        step.startedAt = new Date().toISOString();
        return cloneStep(step);
      });
    },
    async applyStatus(planId, stepId, status: StepStatus, result) {
      const step = ensurePlan(planId).steps.find((item) => item.id === stepId);
      if (!step) return;
      step.status = status;
      step.result = result;
      const terminal = status === "completed" || status === "failed" || status === "cancelled";
      if (terminal) step.completedAt = new Date().toISOString();
      if (status === "pending") step.completedAt = null;
    },
    async addFeedback(input: FeedbackInput) {
      ensurePlan(input.planId).feedback.push({
        ...input,
        createdAt: new Date().toISOString(),
      });
    },
    async latestFeedback(planId) {
      const map = new Map<string, FeedbackRecord>();
      for (const item of ensurePlan(planId).feedback) map.set(item.stepId, item);
      return map;
    },
    async replan(planId, change: ReplanChange) {
      const state = ensurePlan(planId);
      for (const id of change.cancel) {
        const step = state.steps.find((item) => item.id === id);
        if (step && step.status !== "completed") {
          step.status = "cancelled";
          step.completedAt = new Date().toISOString();
        }
      }
      for (const link of change.retarget) {
        for (const step of state.steps) {
          step.dependencies = step.dependencies.map((dep) => (dep === link.from ? link.to : dep));
        }
      }
      for (const draft of change.add) {
        if (!state.steps.some((item) => item.id === draft.id)) {
          state.steps.push(fromDraft(planId, draft));
        }
      }
      state.version += 1;
    },
    async reopen(planId, stepId) {
      const step = ensurePlan(planId).steps.find((item) => item.id === stepId);
      if (!step || (step.status !== "blocked" && step.status !== "failed")) return false;
      step.status = "pending";
      step.completedAt = null;
      return true;
    },
  };
}

export function getWorkflowRepository(): WorkflowRepository {
  if (!repo) repo = createMemoryRepository();
  return repo;
}

export function runningStepCount(planId = PLAN_ID): number {
  return ensurePlan(planId).steps.filter((step) => step.status === "running").length;
}

export function hydrateCompleted(planId: string, backfillDone: boolean): void {
  if (!backfillDone) return;
  const done = new Set(["schema", "senate-client", "parse-normalize", "serve-api", "backfill-3y", "incremental-6h"]);
  for (const step of ensurePlan(planId).steps) {
    if (done.has(step.handler) && step.status === "pending") {
      step.status = "completed";
      step.completedAt = new Date().toISOString();
    }
  }
}
