import { getPool } from "../db/pool";
import { CLAIM_SQL } from "./claim";
import { PLAN_ID, senateSteps } from "./seed";
import type {
  FeedbackInput,
  FeedbackRecord,
  ReplanChange,
  StepDraft,
  StepRecord,
  StepStatus,
  WorkflowRepository,
} from "./types";

type StepRow = {
  id: string;
  plan_id: string;
  position: number;
  title: string;
  description: string;
  objective: string;
  status: StepStatus;
  acceptance_criteria: string[];
  dependencies: string[];
  complexity: string;
  tools: string[];
  risks: string[];
  handler: string;
  attempts: number;
  max_attempts: number;
  result: unknown;
  started_at: Date | null;
  completed_at: Date | null;
};

function mapStep(row: StepRow): StepRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    position: row.position,
    title: row.title,
    description: row.description,
    objective: row.objective,
    status: row.status,
    acceptanceCriteria: row.acceptance_criteria ?? [],
    dependencies: row.dependencies ?? [],
    complexity: row.complexity,
    tools: row.tools ?? [],
    risks: row.risks ?? [],
    handler: row.handler,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    result: row.result,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

async function insertStep(planId: string, step: StepDraft): Promise<void> {
  await getPool().query(
    `INSERT INTO workflow_steps (
      plan_id, id, position, title, description, objective, status,
      acceptance_criteria, dependencies, complexity, tools, risks, handler, max_attempts
    ) VALUES (
      $1,$2,$3,$4,$5,$6,'pending',$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12,$13
    ) ON CONFLICT (plan_id, id) DO NOTHING`,
    [
      planId,
      step.id,
      step.position,
      step.title,
      step.description,
      step.objective,
      JSON.stringify(step.acceptanceCriteria),
      step.dependencies,
      step.complexity,
      JSON.stringify(step.tools),
      JSON.stringify(step.risks),
      step.handler,
      step.maxAttempts,
    ],
  );
}

export async function seedPlan(): Promise<void> {
  await getPool().query(
    `INSERT INTO workflow_plans (id, title, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [PLAN_ID, "Scrape de PTRs do Senado"],
  );
  for (const step of senateSteps()) await insertStep(PLAN_ID, step);
}

export function createPgRepository(): WorkflowRepository {
  return {
    async listSteps(planId) {
      const result = await getPool().query<StepRow>(
        "SELECT * FROM workflow_steps WHERE plan_id = $1 ORDER BY position, id",
        [planId],
      );
      return result.rows.map(mapStep);
    },
    async claim(planId, stepId) {
      const result = await getPool().query<StepRow>(CLAIM_SQL, [planId, stepId]);
      const row = result.rows[0];
      return row ? mapStep(row) : null;
    },
    async applyStatus(planId, stepId, status, result) {
      await getPool().query(
        `UPDATE workflow_steps
         SET status = $3,
             result = $4::jsonb,
             completed_at = CASE
               WHEN $3 IN ('completed', 'failed', 'cancelled') THEN now()
               WHEN $3 = 'pending' THEN NULL
               ELSE completed_at
             END
         WHERE plan_id = $1 AND id = $2`,
        [planId, stepId, status, JSON.stringify(result)],
      );
    },
    async addFeedback(input: FeedbackInput) {
      await getPool().query(
        `INSERT INTO workflow_feedback
          (plan_id, step_id, expected, actual, errors, evidence, decision, reason, next_action)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
        [
          input.planId,
          input.stepId,
          input.expected,
          input.actual,
          JSON.stringify(input.errors),
          JSON.stringify(input.evidence),
          input.decision,
          input.reason,
          input.nextAction,
        ],
      );
    },
    async latestFeedback(planId) {
      const result = await getPool().query<{
        step_id: string;
        expected: string;
        actual: string;
        errors: string[];
        evidence: Record<string, unknown>;
        decision: FeedbackInput["decision"];
        reason: string;
        next_action: string;
        created_at: Date;
        plan_id: string;
      }>(
        `SELECT DISTINCT ON (step_id)
           plan_id, step_id, expected, actual, errors, evidence, decision, reason, next_action, created_at
         FROM workflow_feedback
         WHERE plan_id = $1
         ORDER BY step_id, created_at DESC`,
        [planId],
      );
      const map = new Map<string, FeedbackRecord>();
      for (const row of result.rows) {
        map.set(row.step_id, {
          planId: row.plan_id,
          stepId: row.step_id,
          expected: row.expected,
          actual: row.actual,
          errors: row.errors ?? [],
          evidence: row.evidence ?? {},
          decision: row.decision,
          reason: row.reason,
          nextAction: row.next_action,
          createdAt: new Date(row.created_at).toISOString(),
        });
      }
      return map;
    },
    async replan(planId, change: ReplanChange) {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const plan = await client.query<{ version: number }>(
          "SELECT version FROM workflow_plans WHERE id = $1 FOR UPDATE",
          [planId],
        );
        const steps = await client.query("SELECT * FROM workflow_steps WHERE plan_id = $1 ORDER BY position", [planId]);
        await client.query(
          `INSERT INTO workflow_plan_revisions (plan_id, version, snapshot, reason)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [planId, plan.rows[0]?.version ?? 1, JSON.stringify({ steps: steps.rows }), change.reason],
        );
        if (change.cancel.length > 0) {
          await client.query(
            `UPDATE workflow_steps
             SET status = 'cancelled', completed_at = now()
             WHERE plan_id = $1 AND id = ANY($2::text[]) AND status <> 'completed'`,
            [planId, change.cancel],
          );
        }
        for (const link of change.retarget) {
          await client.query(
            `UPDATE workflow_steps
             SET dependencies = array_replace(dependencies, $2, $3)
             WHERE plan_id = $1`,
            [planId, link.from, link.to],
          );
        }
        await client.query("UPDATE workflow_plans SET version = version + 1 WHERE id = $1", [planId]);
        for (const step of change.add) {
          await client.query(
            `INSERT INTO workflow_steps (
              plan_id, id, position, title, description, objective, status,
              acceptance_criteria, dependencies, complexity, tools, risks, handler, max_attempts
            ) VALUES (
              $1,$2,$3,$4,$5,$6,'pending',$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12,$13
            ) ON CONFLICT (plan_id, id) DO NOTHING`,
            [
              planId,
              step.id,
              step.position,
              step.title,
              step.description,
              step.objective,
              JSON.stringify(step.acceptanceCriteria),
              step.dependencies,
              step.complexity,
              JSON.stringify(step.tools),
              JSON.stringify(step.risks),
              step.handler,
              step.maxAttempts,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async reopen(planId, stepId) {
      const result = await getPool().query(
        `UPDATE workflow_steps
         SET status = 'pending', completed_at = NULL
         WHERE plan_id = $1 AND id = $2 AND status IN ('blocked', 'failed')`,
        [planId, stepId],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
