export type StepStatus = "pending" | "running" | "completed" | "blocked" | "failed" | "cancelled";

export type Decision = "APPROVED" | "RETRY" | "REPLAN" | "BLOCKED" | "FAILED";

export type StepRecord = {
  id: string;
  planId: string;
  position: number;
  title: string;
  description: string;
  objective: string;
  status: StepStatus;
  acceptanceCriteria: string[];
  dependencies: string[];
  complexity: string;
  tools: string[];
  risks: string[];
  handler: string;
  attempts: number;
  maxAttempts: number;
  result: unknown;
  startedAt: string | null;
  completedAt: string | null;
};

export type StepDraft = {
  id: string;
  position: number;
  title: string;
  description: string;
  objective: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  complexity: string;
  tools: string[];
  risks: string[];
  handler: string;
  maxAttempts: number;
};

export type ReplanChange = {
  reason: string;
  cancel: string[];
  add: StepDraft[];
  retarget: Array<{ from: string; to: string }>;
};

export type HandlerOutput = {
  expected: string;
  actual: string;
  errors?: string[];
  evidence?: Record<string, unknown>;
  blocked?: boolean;
  replan?: ReplanChange;
};

export type FeedbackInput = {
  planId: string;
  stepId: string;
  expected: string;
  actual: string;
  errors: string[];
  evidence: Record<string, unknown>;
  decision: Decision;
  reason: string;
  nextAction: string;
};

export type FeedbackRecord = FeedbackInput & { createdAt: string };

export interface WorkflowRepository {
  listSteps(planId: string): Promise<StepRecord[]>;
  claim(planId: string, stepId: string): Promise<StepRecord | null>;
  applyStatus(planId: string, stepId: string, status: StepStatus, result: unknown): Promise<void>;
  addFeedback(input: FeedbackInput): Promise<void>;
  latestFeedback(planId: string): Promise<Map<string, FeedbackRecord>>;
  replan(planId: string, change: ReplanChange): Promise<void>;
  reopen(planId: string, stepId: string): Promise<boolean>;
}
