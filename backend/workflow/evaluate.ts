import type { Decision, HandlerOutput, StepRecord } from "./types";

export const REQUIRED_TABLES = [
  "workflow_plans",
  "workflow_steps",
  "workflow_feedback",
  "workflow_plan_revisions",
  "senate_filings",
  "senate_trades",
  "scrape_state",
];

const NEXT_ACTION: Record<Decision, string> = {
  APPROVED: "Avançar para a próxima etapa executável.",
  RETRY: "Executar a etapa de novo.",
  REPLAN: "O plano foi revisado e a etapa atual foi cancelada.",
  BLOCKED: "Aguardar banco, proxy ou intervenção humana.",
  FAILED: "Etapa encerrada depois do limite de tentativas.",
};

export function decide(input: {
  met: boolean;
  blocked: boolean;
  replan: boolean;
  attempts: number;
  maxAttempts: number;
}): Decision {
  if (input.replan) return "REPLAN";
  if (input.blocked) return "BLOCKED";
  if (input.met) return "APPROVED";
  if (input.attempts >= input.maxAttempts) return "FAILED";
  return "RETRY";
}

export function criteriaMet(step: StepRecord, output: HandlerOutput): boolean {
  if (output.blocked || output.replan) return false;
  const evidence = output.evidence ?? {};
  switch (step.handler) {
    case "schema": {
      const tables = new Set((evidence.tables as string[] | undefined) ?? []);
      return REQUIRED_TABLES.every((table) => tables.has(table));
    }
    case "parse-normalize":
      return evidence.exitCode === 0;
    case "senate-client":
      return evidence.ok === true;
    case "serve-api":
      return evidence.envelope === true;
    case "backfill-3y": {
      const before = Number(evidence.filingsBefore ?? 0);
      const after = Number(evidence.filingsAfter ?? 0);
      const inserted = Number(evidence.inserted ?? -1);
      return evidence.backfillCompleted === true
        && evidence.duplicatePassAdded === 0
        && after - before === inserted;
    }
    case "incremental-6h":
      return evidence.secondRunAdded === 0 && evidence.scheduled === true;
    default:
      return evidence.met === true;
  }
}

export function judge(step: StepRecord, output: HandlerOutput): {
  decision: Decision;
  expected: string;
  actual: string;
  errors: string[];
  evidence: Record<string, unknown>;
  reason: string;
  nextAction: string;
} {
  const decision = decide({
    met: criteriaMet(step, output),
    blocked: Boolean(output.blocked),
    replan: Boolean(output.replan),
    attempts: step.attempts,
    maxAttempts: step.maxAttempts,
  });
  const errors = output.errors ?? [];
  let reason = "Critérios de aceitação confirmados pela evidência.";
  if (decision === "BLOCKED") reason = output.actual;
  else if (decision === "REPLAN") reason = output.replan?.reason ?? output.actual;
  else if (decision === "FAILED") reason = "Tentativas esgotadas sem cumprir os critérios.";
  else if (decision === "RETRY") reason = errors[0] ?? "Os critérios de aceitação ainda não foram cumpridos.";

  return {
    decision,
    expected: output.expected,
    actual: output.actual,
    errors,
    evidence: output.evidence ?? {},
    reason,
    nextAction: NEXT_ACTION[decision],
  };
}

export function statusFor(decision: Decision): StepRecord["status"] {
  switch (decision) {
    case "APPROVED":
      return "completed";
    case "RETRY":
      return "pending";
    case "BLOCKED":
      return "blocked";
    case "FAILED":
      return "failed";
    case "REPLAN":
      return "cancelled";
  }
}
