import { getPool } from "../db/pool";
import { scrapesInFlight, type ScrapeState } from "../services/senate/store";

export type PublicTrade = {
  member: string;
  chamber: string;
  ticker: string;
  trade_type: string;
  amount: string;
  tx_date: string | null;
  disclosed: string;
  asset: string;
  link: string;
};

export const ENVELOPE_KEYS = [
  "total",
  "offset",
  "limit",
  "has_more",
  "trades",
  "data_current",
  "cache_loading",
  "last_updated",
  "data_lag_minutes",
  "next_refresh_in_minutes",
] as const;

export const TRADE_KEYS = [
  "member",
  "chamber",
  "ticker",
  "trade_type",
  "amount",
  "tx_date",
  "disclosed",
  "asset",
  "link",
] as const;

export type Freshness = {
  dataCurrent: boolean;
  cacheLoading: boolean;
  lastUpdated: string | null;
  dataLagMinutes: number | null;
  nextRefreshInMinutes: number;
};

export function buildFreshness(state: ScrapeState, runningSteps: number, now = new Date()): Freshness {
  const last = state.lastSuccessAt;
  const lag = last ? Math.max(0, Math.round((now.getTime() - last.getTime()) / 60_000)) : null;
  return {
    dataCurrent: Boolean(state.backfillCompletedAt) && !state.lastError,
    cacheLoading: runningSteps > 0 || scrapesInFlight() > 0,
    lastUpdated: last ? last.toISOString() : null,
    dataLagMinutes: lag,
    nextRefreshInMinutes: lag === null ? 360 : Math.max(0, 360 - lag),
  };
}

export function buildEnvelope(input: {
  total: number;
  offset: number;
  limit: number;
  trades: PublicTrade[];
  freshness: Freshness;
}) {
  return {
    total: input.total,
    offset: input.offset,
    limit: input.limit,
    has_more: input.offset + input.trades.length < input.total,
    trades: input.trades,
    data_current: input.freshness.dataCurrent,
    cache_loading: input.freshness.cacheLoading,
    last_updated: input.freshness.lastUpdated,
    data_lag_minutes: input.freshness.dataLagMinutes,
    next_refresh_in_minutes: input.freshness.nextRefreshInMinutes,
  };
}

export type TradeQuery = {
  limit: number;
  offset: number;
  days: number | null;
  chamber: string | null;
  ticker: string | null;
};

export function parseTradeQuery(search: URLSearchParams, ticker: string | null = null): TradeQuery {
  const limitRaw = Number(search.get("limit") ?? 50);
  const offsetRaw = Number(search.get("offset") ?? 0);
  const daysRaw = search.get("days");
  return {
    limit: Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50)),
    offset: Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0),
    days: daysRaw === null || daysRaw === "" ? null : Math.max(0, Math.floor(Number(daysRaw)) || 0),
    chamber: search.get("chamber"),
    ticker: ticker ? ticker.toUpperCase() : null,
  };
}

export async function queryTrades(query: TradeQuery) {
  const chamber = query.chamber?.trim();
  const freshness = await loadFreshness();
  if (chamber && chamber.toLowerCase() !== "senate") {
    return buildEnvelope({ total: 0, offset: query.offset, limit: query.limit, trades: [], freshness });
  }

  const where = `WHERE ($1::text IS NULL OR ticker = $1)
    AND ($2::int IS NULL OR disclosed >= CURRENT_DATE - $2::int)`;
  const params = [query.ticker, query.days];
  const totalResult = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM senate_trades ${where}`,
    params,
  );
  const rows = await getPool().query<PublicTrade>(
    `SELECT member, chamber, ticker, trade_type, amount,
            tx_date::text AS tx_date, disclosed::text AS disclosed, asset, link
     FROM senate_trades
     ${where}
     ORDER BY disclosed DESC, tx_date DESC NULLS LAST, id DESC
     LIMIT $3 OFFSET $4`,
    [...params, query.limit, query.offset],
  );
  return buildEnvelope({
    total: Number(totalResult.rows[0]?.count ?? 0),
    offset: query.offset,
    limit: query.limit,
    trades: rows.rows,
    freshness,
  });
}

export async function loadHealth() {
  const freshness = await loadFreshness();
  const filings = await getPool().query<{ count: string }>("SELECT count(*)::text AS count FROM senate_filings");
  const trades = await getPool().query<{ count: string }>("SELECT count(*)::text AS count FROM senate_trades");
  const state = await getPool().query<{ last_error: string | null; backfill_completed_at: Date | null }>(
    "SELECT last_error, backfill_completed_at FROM scrape_state WHERE id = 1",
  );
  return {
    data_current: freshness.dataCurrent,
    cache_loading: freshness.cacheLoading,
    last_updated: freshness.lastUpdated,
    data_lag_minutes: freshness.dataLagMinutes,
    next_refresh_in_minutes: freshness.nextRefreshInMinutes,
    filings: Number(filings.rows[0]?.count ?? 0),
    trades: Number(trades.rows[0]?.count ?? 0),
    last_error: state.rows[0]?.last_error ?? null,
    backfill_completed: Boolean(state.rows[0]?.backfill_completed_at),
  };
}

async function loadFreshness(): Promise<Freshness> {
  const state = await getPool().query<{
    backfill_completed_at: Date | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_started_at: Date | null;
  }>("SELECT backfill_completed_at, last_success_at, last_error, last_started_at FROM scrape_state WHERE id = 1");
  const running = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM workflow_steps WHERE plan_id = 'senate-efd' AND status = 'running'",
  );
  const row = state.rows[0];
  return buildFreshness(
    {
      backfillCompletedAt: row?.backfill_completed_at ?? null,
      lastSuccessAt: row?.last_success_at ?? null,
      lastError: row?.last_error ?? null,
      lastStartedAt: row?.last_started_at ?? null,
    },
    Number(running.rows[0]?.count ?? 0),
  );
}
