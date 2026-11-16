import { bootstrap } from "../bootstrap";
import { databaseUrl } from "../db/prisma";
import {
  loadHealth,
  parseLeaderDates,
  parseLeaderMetric,
  parseMemberSearch,
  parseTradeQuery,
  parseCompanyMetric,
  parseBiggestBuyerPeriod,
  queryBiggestBuyer,
  queryCompanyDetail,
  queryCompanyLeaders,
  queryMembers,
  queryOperationLeaders,
  queryTrades,
} from "./trades";
import { getWorkflowRepository } from "../workflow/repository";
import { dependenciesDone } from "../workflow/runner";
import { PLAN_ID } from "../workflow/seed";

export type ServiceSuccess<T> = { ok: true; status: number; data: T };
export type ServiceFailure = { ok: false; status: number; error: string };
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "banco indisponível";
}

function ok<T>(data: T, status = 200): ServiceSuccess<T> {
  return { ok: true, status, data };
}

function fail(status: number, error: string): ServiceFailure {
  return { ok: false, status, error };
}

const emptyHealth = {
  data_current: false,
  cache_loading: false,
  last_updated: null,
  data_lag_minutes: null,
  next_refresh_in_minutes: 360,
  filings: 0,
  trades: 0,
  senate_filings: 0,
  senate_trades: 0,
  house_filings: 0,
  house_trades: 0,
  backfill_completed: false,
};

export async function getHealth() {
  await bootstrap();
  if (!databaseUrl()) {
    return { ...emptyHealth, last_error: "DATABASE_URL ausente" };
  }
  try {
    return await loadHealth();
  } catch (error) {
    return { ...emptyHealth, last_error: message(error) };
  }
}

export async function listTrades(search: URLSearchParams, ticker: string | null = null) {
  await bootstrap();
  try {
    return ok(await queryTrades(parseTradeQuery(search, ticker)));
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function listMembers() {
  await bootstrap();
  try {
    return ok(await queryMembers(null));
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function searchMembers(body: { q?: unknown; name?: unknown }) {
  await bootstrap();
  const nameQuery = parseMemberSearch(body);
  if (!nameQuery) return fail(400, "q obrigatório");
  try {
    return ok(await queryMembers(nameQuery));
  } catch (error) {
    return fail(503, message(error));
  }
}

function jsonInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

export async function listOperationLeaders(body: {
  from?: unknown;
  to?: unknown;
  tx_date_from?: unknown;
  tx_date_to?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  metric?: unknown;
}) {
  await bootstrap();
  const range = parseLeaderDates(body);
  if (!range) return fail(400, "data inválida");
  if (range.from && range.to && range.from > range.to) return fail(400, "data inicial depois da final");
  const metric = parseLeaderMetric(body.metric);
  if (!metric) return fail(400, "medida inválida");
  try {
    return ok(await queryOperationLeaders(range, metric));
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function listCompanyLeaders(body: {
  from?: unknown;
  to?: unknown;
  tx_date_from?: unknown;
  tx_date_to?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  metric?: unknown;
}) {
  await bootstrap();
  const range = parseLeaderDates(body);
  if (!range) return fail(400, "data inválida");
  if (range.from && range.to && range.from > range.to) return fail(400, "data inicial depois da final");
  const metric = parseCompanyMetric(body.metric);
  if (!metric) return fail(400, "medida inválida");
  try {
    return ok(await queryCompanyLeaders(range, metric));
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function getBiggestBuyer(periodRaw: unknown) {
  await bootstrap();
  const period = parseBiggestBuyerPeriod(periodRaw);
  if (!period) return fail(400, "período inválido");
  try {
    return ok({ period, buyer: await queryBiggestBuyer(period) });
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function readCompanyDetail(body: {
  ticker?: unknown;
  from?: unknown;
  to?: unknown;
  tx_date_from?: unknown;
  tx_date_to?: unknown;
  date_from?: unknown;
  date_to?: unknown;
}) {
  await bootstrap();
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!ticker || ticker.length > 16) return fail(400, "ticker obrigatório");
  const range = parseLeaderDates(body);
  if (!range) return fail(400, "data inválida");
  if (range.from && range.to && range.from > range.to) return fail(400, "data inicial depois da final");
  try {
    return ok(await queryCompanyDetail(ticker, range));
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function listMemberTrades(body: { name?: unknown; limit?: unknown; offset?: unknown; all?: unknown }) {
  await bootstrap();
  const member = typeof body.name === "string" ? body.name.trim() : "";
  if (!member) return fail(400, "nome obrigatório");
  try {
    const tradeQuery = parseTradeQuery(new URLSearchParams());
    tradeQuery.member = member;
    tradeQuery.memberExact = true;
    if (body.all === true) {
      return ok({ name: member, ...(await queryTrades(tradeQuery, { unbounded: true })) });
    }
    tradeQuery.limit = jsonInt(body.limit, tradeQuery.limit, 1, 500);
    tradeQuery.offset = jsonInt(body.offset, tradeQuery.offset, 0, Number.MAX_SAFE_INTEGER);
    return ok({ name: member, ...(await queryTrades(tradeQuery)) });
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function readWorkflow() {
  await bootstrap();
  try {
    const repo = getWorkflowRepository();
    const steps = await repo.listSteps(PLAN_ID);
    const feedback = await repo.latestFeedback(PLAN_ID);
    const plan = await repo.getPlan(PLAN_ID);
    const counts = { pending: 0, running: 0, completed: 0, blocked: 0, failed: 0, cancelled: 0 };
    for (const step of steps) counts[step.status] += 1;
    const current = steps.find((step) => step.status === "running")
      ?? steps.find((step) => step.status === "pending" && dependenciesDone(steps, step))
      ?? null;
    return ok({
      plan: {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        version: plan.version,
        parent_plan_id: plan.parentPlanId,
      },
      counts,
      current: current?.id ?? null,
      steps: steps.map((step) => ({ ...step, feedback: feedback.get(step.id) ?? null })),
    });
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function readWorkflowStep(stepId: string) {
  const workflow = await readWorkflow();
  if (!workflow.ok) return workflow;
  const step = workflow.data.steps.find((item) => item.id === stepId);
  if (!step) return fail(404, "etapa inexistente");
  return ok(step);
}

export async function retryWorkflow(stepId: string) {
  await bootstrap();
  const id = stepId.trim();
  if (!id) return fail(400, "stepId obrigatório");
  try {
    const reopened = await getWorkflowRepository().reopen(PLAN_ID, id);
    if (!reopened) return fail(409, "etapa não está blocked ou failed");
    return ok({ stepId: id, status: "pending" as const });
  } catch (error) {
    return fail(503, message(error));
  }
}

export async function cancelWorkflowStep(stepId: string) {
  await bootstrap();
  const id = stepId.trim();
  if (!id) return fail(400, "stepId obrigatório");
  try {
    const repo = getWorkflowRepository();
    const steps = await repo.listSteps(PLAN_ID);
    const step = steps.find((item) => item.id === id);
    if (!step) return fail(404, "etapa inexistente");
    if (step.status === "cancelled") return ok({ stepId: id, status: "cancelled" as const });
    if (step.status === "completed" || step.status === "running") {
      return fail(409, "etapa não pode ser cancelada");
    }
    await repo.replan(PLAN_ID, {
      reason: "cancelamento solicitado",
      cancel: [id],
      add: [],
      retarget: [],
    });
    return ok({ stepId: id, status: "cancelled" as const });
  } catch (error) {
    return fail(503, message(error));
  }
}
