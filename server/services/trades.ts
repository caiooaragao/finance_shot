import { getPrisma, query } from "../db/prisma";
import { scrapesInFlight, type ScrapeState } from "../services/senate/store";
import { runningStepCount } from "../workflow/repository";

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

export type PublicMember = {
  name: string;
  chambers: string[];
};

export type TradeQuery = {
  limit: number;
  offset: number;
  days: number | null;
  chamber: string | null;
  ticker: string | null;
  tickerExact: boolean;
  member: string | null;
  memberExact: boolean;
  asset: string | null;
  tradeType: string | null;
  amount: string | null;
  link: string | null;
  txDate: string | null;
  txDateFrom: string | null;
  txDateTo: string | null;
  disclosed: string | null;
  disclosedFrom: string | null;
  disclosedTo: string | null;
  q: string | null;
};

function blank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function isoDate(value: string | null): string | null {
  const trimmed = blank(value);
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseTradeQuery(search: URLSearchParams, ticker: string | null = null): TradeQuery {
  const limitRaw = Number(search.get("limit") ?? 50);
  const offsetRaw = Number(search.get("offset") ?? 0);
  const daysRaw = search.get("days");
  const pathTicker = blank(ticker)?.toUpperCase() ?? null;
  return {
    limit: Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50)),
    offset: Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0),
    days: daysRaw === null || daysRaw === "" ? null : Math.max(0, Math.floor(Number(daysRaw)) || 0),
    chamber: blank(search.get("chamber")),
    ticker: pathTicker ?? blank(search.get("ticker")),
    tickerExact: Boolean(pathTicker),
    member: blank(search.get("member")),
    memberExact: false,
    asset: blank(search.get("asset") ?? search.get("company")),
    tradeType: blank(search.get("trade_type") ?? search.get("type")),
    amount: blank(search.get("amount")),
    link: blank(search.get("link")),
    txDate: isoDate(search.get("tx_date") ?? search.get("date")),
    txDateFrom: isoDate(search.get("tx_date_from") ?? search.get("date_from")),
    txDateTo: isoDate(search.get("tx_date_to") ?? search.get("date_to")),
    disclosed: isoDate(search.get("disclosed")),
    disclosedFrom: isoDate(search.get("disclosed_from")),
    disclosedTo: isoDate(search.get("disclosed_to")),
    q: blank(search.get("q")),
  };
}

function tradeFilterSql(tickerExact: boolean, memberExact: boolean): string {
  const tickerClause = tickerExact
    ? "($1::text IS NULL OR ticker = $1)"
    : "($1::text IS NULL OR ticker ILIKE '%' || $1 || '%')";
  const memberClause = memberExact
    ? "($3::text IS NULL OR lower(btrim(member)) = lower($3))"
    : "($3::text IS NULL OR member ILIKE '%' || $3 || '%')";
  return `WHERE ${tickerClause}
    AND ($2::int IS NULL OR disclosed >= CURRENT_DATE - $2::int)
    AND ${memberClause}
    AND ($4::text IS NULL OR asset ILIKE '%' || $4 || '%')
    AND ($5::text IS NULL OR trade_type ILIKE '%' || $5 || '%')
    AND ($6::text IS NULL OR amount ILIKE '%' || $6 || '%')
    AND ($7::text IS NULL OR link ILIKE '%' || $7 || '%')
    AND ($8::date IS NULL OR tx_date = $8::date)
    AND ($9::date IS NULL OR tx_date >= $9::date)
    AND ($10::date IS NULL OR tx_date <= $10::date)
    AND ($11::date IS NULL OR disclosed = $11::date)
    AND ($12::date IS NULL OR disclosed >= $12::date)
    AND ($13::date IS NULL OR disclosed <= $13::date)
    AND (
      $14::text IS NULL
      OR member ILIKE '%' || $14 || '%'
      OR asset ILIKE '%' || $14 || '%'
      OR ticker ILIKE '%' || $14 || '%'
      OR amount ILIKE '%' || $14 || '%'
      OR trade_type ILIKE '%' || $14 || '%'
      OR chamber ILIKE '%' || $14 || '%'
      OR link ILIKE '%' || $14 || '%'
    )`;
}

function tradeFilterParams(tradeQuery: TradeQuery): unknown[] {
  return [
    tradeQuery.ticker,
    tradeQuery.days,
    tradeQuery.member,
    tradeQuery.asset,
    tradeQuery.tradeType,
    tradeQuery.amount,
    tradeQuery.link,
    tradeQuery.txDate,
    tradeQuery.txDateFrom,
    tradeQuery.txDateTo,
    tradeQuery.disclosed,
    tradeQuery.disclosedFrom,
    tradeQuery.disclosedTo,
    tradeQuery.q,
  ];
}

function tradeTables(chamber: string | null): string[] | null {
  const value = chamber?.trim().toLowerCase() ?? "";
  if (!value) return ["senate_trades", "house_trades"];
  if (value === "senate") return ["senate_trades"];
  if (value === "house") return ["house_trades"];
  return null;
}

export async function queryTrades(tradeQuery: TradeQuery, options?: { unbounded?: boolean }) {
  const freshness = await loadFreshness();
  const tables = tradeTables(tradeQuery.chamber);
  if (!tables) {
    return buildEnvelope({ total: 0, offset: tradeQuery.offset, limit: tradeQuery.limit, trades: [], freshness });
  }

  const where = tradeFilterSql(tradeQuery.tickerExact, tradeQuery.memberExact);
  const params = tradeFilterParams(tradeQuery);
  const union = tables
    .map(
      (table) => `SELECT member, chamber, ticker, trade_type, amount, tx_date, disclosed, asset, link, id
       FROM ${table}
       ${where}`,
    )
    .join(" UNION ALL ");
  const totalResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM (${union}) AS trades`,
    params,
  );
  const selected = `SELECT member, chamber, ticker, trade_type, amount,
            tx_date::text AS tx_date, disclosed::text AS disclosed, asset, link
     FROM (${union}) AS trades
     ORDER BY disclosed DESC, tx_date DESC NULLS LAST, id DESC`;
  const rows = options?.unbounded
    ? await query<PublicTrade>(selected, params)
    : await query<PublicTrade>(`${selected} LIMIT $15 OFFSET $16`, [
        ...params,
        tradeQuery.limit,
        tradeQuery.offset,
      ]);
  const total = Number(totalResult[0]?.count ?? 0);
  return buildEnvelope({
    total,
    offset: options?.unbounded ? 0 : tradeQuery.offset,
    limit: options?.unbounded ? total : tradeQuery.limit,
    trades: rows,
    freshness,
  });
}

export function parseMemberSearch(body: { q?: unknown; name?: unknown }): string | null {
  const raw = body.q !== undefined ? body.q : body.name;
  return typeof raw === "string" ? blank(raw) : null;
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export type LeaderMetric = "count" | "notional" | "buy" | "sell";

export type OperationLeader = {
  name: string;
  count: number;
  value: number;
  chambers: string[];
};

export type OperationLeaders = {
  total: number;
  metric: LeaderMetric;
  from: string | null;
  to: string | null;
  leaders: OperationLeader[];
};

const LEADER_METRICS = new Set<LeaderMetric>(["count", "notional", "buy", "sell"]);

export function parseLeaderMetric(value: unknown): LeaderMetric | null {
  if (value === undefined || value === null || value === "") return "count";
  if (typeof value === "string" && LEADER_METRICS.has(value as LeaderMetric)) return value as LeaderMetric;
  return null;
}

const METRIC_EXPR: Record<LeaderMetric, string> = {
  count: "count(*)",
  buy: "count(*) FILTER (WHERE trade_type = 'buy')",
  sell: "count(*) FILTER (WHERE trade_type = 'sell')",
  notional: "coalesce(sum(midpoint), 0)",
};

const SCORED_OPS = `WITH scored AS (
  SELECT btrim(ops.member) AS member,
         ops.chamber,
         lower(btrim(ops.trade_type)) AS trade_type,
         valued.midpoint
  FROM (
    SELECT member, chamber, trade_type, amount, tx_date FROM senate_trades
    UNION ALL
    SELECT member, chamber, trade_type, amount, tx_date FROM house_trades
  ) AS ops
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN cardinality(nums) = 0 THEN NULL::numeric
      WHEN cardinality(nums) = 1 THEN nums[1]
      ELSE (nums[1] + nums[cardinality(nums)]) / 2
    END AS midpoint
    FROM (
      SELECT COALESCE(
        ARRAY(
          SELECT amount_match[1]::numeric
          FROM regexp_matches(
            regexp_replace(coalesce(ops.amount, ''), '[$,]', '', 'g'),
            '\\d+(?:\\.\\d+)?',
            'g'
          ) AS amount_match
        ),
        ARRAY[]::numeric[]
      ) AS nums
    ) AS parsed
  ) AS valued
  WHERE btrim(ops.member) <> ''
    AND ($1::date IS NULL OR ops.tx_date >= $1::date)
    AND ($2::date IS NULL OR ops.tx_date <= $2::date)
)`;

export function parseLeaderDates(body: {
  from?: unknown;
  to?: unknown;
  tx_date_from?: unknown;
  tx_date_to?: unknown;
  date_from?: unknown;
  date_to?: unknown;
}): { from: string | null; to: string | null } | null {
  const from = readOptionalDate(body.from ?? body.tx_date_from ?? body.date_from);
  const to = readOptionalDate(body.to ?? body.tx_date_to ?? body.date_to);
  if (from === undefined || to === undefined) return null;
  return { from, to };
}

function readOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  return isoDate(value) ?? undefined;
}

function asChambers(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((item) => item !== "");
  if (typeof value !== "string" || value === "{}") return [];
  return value
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export async function queryOperationLeaders(
  range: { from: string | null; to: string | null },
  metric: LeaderMetric = "count",
): Promise<OperationLeaders> {
  const params = [range.from, range.to];
  const valueExpr = METRIC_EXPR[metric];
  const totalExpr = metric === "count" ? "operations" : metric === "buy" ? "buys" : metric === "sell" ? "sells" : "notional";
  const [totalRow, leaders] = await Promise.all([
    query<{ operations: number | string | bigint; buys: number | string | bigint; sells: number | string | bigint; notional: number | string | bigint }>(
      `${SCORED_OPS}
       SELECT count(*)::int AS operations,
              count(*) FILTER (WHERE trade_type = 'buy')::int AS buys,
              count(*) FILTER (WHERE trade_type = 'sell')::int AS sells,
              coalesce(sum(midpoint), 0)::float8 AS notional
       FROM scored`,
      params,
    ),
    query<{ name: string; count: number | string | bigint; value: number | string | bigint; chambers: unknown }>(
      `${SCORED_OPS}
       SELECT min(member) AS name,
              count(*)::int AS count,
              (${valueExpr})::float8 AS value,
              array_agg(DISTINCT chamber ORDER BY chamber) AS chambers
       FROM scored
       GROUP BY lower(member)
       HAVING ${valueExpr} > 0
       ORDER BY ${valueExpr} DESC, min(member) ASC
       LIMIT 20`,
      params,
    ),
  ]);
  const totals = totalRow[0];
  return {
    total: Number(totals?.[totalExpr] ?? 0),
    metric,
    from: range.from,
    to: range.to,
    leaders: leaders.map((row) => ({
      name: row.name,
      count: Number(row.count),
      value: Number(row.value),
      chambers: asChambers(row.chambers),
    })),
  };
}

export type CompanyLeader = {
  ticker: string;
  name: string;
  count: number;
  value: number;
};

export type CompanyMetric = "buy" | "sell" | "buy_value" | "sell_value";

export type CompanyLeaders = {
  total: number;
  metric: CompanyMetric;
  leaders: CompanyLeader[];
};

export type CompanyTrade = {
  member: string;
  chamber: string;
  trade_type: string;
  amount: string;
  tx_date: string | null;
  disclosed: string;
  link: string;
};

export type CompanyDetail = {
  ticker: string;
  name: string;
  buys: number;
  sells: number;
  buy_value: number;
  sell_value: number;
  trades: CompanyTrade[];
};

const COMPANY_METRICS = new Set<CompanyMetric>(["buy", "sell", "buy_value", "sell_value"]);

export function parseCompanyMetric(value: unknown): CompanyMetric | null {
  if (typeof value === "string" && COMPANY_METRICS.has(value as CompanyMetric)) return value as CompanyMetric;
  return null;
}

const AMOUNT_MIDPOINT = `CROSS JOIN LATERAL (
    SELECT CASE
      WHEN cardinality(nums) = 0 THEN NULL::numeric
      WHEN cardinality(nums) = 1 THEN nums[1]
      ELSE (nums[1] + nums[cardinality(nums)]) / 2
    END AS midpoint
    FROM (
      SELECT COALESCE(
        ARRAY(
          SELECT amount_match[1]::numeric
          FROM regexp_matches(
            regexp_replace(coalesce(ops.amount, ''), '[$,]', '', 'g'),
            '\\d+(?:\\.\\d+)?',
            'g'
          ) AS amount_match
        ),
        ARRAY[]::numeric[]
      ) AS nums
    ) AS parsed
  ) AS valued`;

const COMPANY_VALUE: Record<CompanyMetric, string> = {
  buy: "count(*) FILTER (WHERE trade_type = 'buy')",
  sell: "count(*) FILTER (WHERE trade_type = 'sell')",
  buy_value: "coalesce(sum(midpoint) FILTER (WHERE trade_type = 'buy'), 0)",
  sell_value: "coalesce(sum(midpoint) FILTER (WHERE trade_type = 'sell'), 0)",
};

const COMPANY_OPS = `WITH scored AS (
  SELECT upper(btrim(ops.ticker)) AS ticker,
         regexp_replace(btrim(ops.asset), '\\s+-\\s+.*$', '') AS cleaned,
         lower(btrim(ops.trade_type)) AS trade_type,
         valued.midpoint
  FROM (
    SELECT ticker, asset, trade_type, amount, tx_date FROM senate_trades
    UNION ALL
    SELECT ticker, asset, trade_type, amount, tx_date FROM house_trades
  ) AS ops
  ${AMOUNT_MIDPOINT}
  WHERE btrim(ops.ticker) <> ''
    AND ($1::date IS NULL OR ops.tx_date >= $1::date)
    AND ($2::date IS NULL OR ops.tx_date <= $2::date)
), labels AS (
  SELECT ticker, cleaned, count(*) AS uses
  FROM scored
  WHERE cleaned <> ''
    AND cleaned !~* 'F S :'
    AND cleaned !~* 'filing'
    AND cleaned !~* 'status'
    AND cleaned !~* 'tatus'
    AND cleaned !~* 'holding'
    AND cleaned !~* 'appendix'
    AND cleaned !~ '^\\d'
  GROUP BY ticker, cleaned
), names AS (
  SELECT DISTINCT ON (ticker) ticker, cleaned AS name
  FROM labels
  ORDER BY ticker, uses DESC, length(cleaned) ASC, cleaned ASC
)`;

export async function queryCompanyLeaders(
  range: { from: string | null; to: string | null },
  metric: CompanyMetric,
): Promise<CompanyLeaders> {
  const params = [range.from, range.to];
  const valueExpr = COMPANY_VALUE[metric];
  const [totalRow, leaders] = await Promise.all([
    query<{ total: number | string | bigint }>(
      `${COMPANY_OPS}
       SELECT (${valueExpr})::float8 AS total
       FROM scored`,
      params,
    ),
    query<{ ticker: string; name: string | null; count: number | string | bigint; value: number | string | bigint }>(
      `${COMPANY_OPS}
       SELECT scored.ticker AS ticker,
              names.name AS name,
              count(*)::int AS count,
              (${valueExpr})::float8 AS value
       FROM scored
       LEFT JOIN names ON names.ticker = scored.ticker
       GROUP BY scored.ticker, names.name
       HAVING ${valueExpr} > 0
       ORDER BY ${valueExpr} DESC, scored.ticker ASC
       LIMIT 20`,
      params,
    ),
  ]);
  return {
    total: Number(totalRow[0]?.total ?? 0),
    metric,
    leaders: leaders.map((row) => ({
      ticker: row.ticker,
      name: row.name?.trim() || row.ticker,
      count: Number(row.count),
      value: Number(row.value),
    })),
  };
}

export async function queryCompanyDetail(
  ticker: string,
  range: { from: string | null; to: string | null },
): Promise<CompanyDetail> {
  const params = [range.from, range.to, ticker];
  const [summary, nameRow, trades] = await Promise.all([
    query<{ buys: number | string | bigint; sells: number | string | bigint; buy_value: number | string | bigint; sell_value: number | string | bigint }>(
      `WITH scored AS (
         SELECT lower(btrim(ops.trade_type)) AS trade_type,
                valued.midpoint
         FROM (
           SELECT trade_type, amount, tx_date, ticker FROM senate_trades
           UNION ALL
           SELECT trade_type, amount, tx_date, ticker FROM house_trades
         ) AS ops
         ${AMOUNT_MIDPOINT}
         WHERE upper(btrim(ops.ticker)) = $3
           AND ($1::date IS NULL OR ops.tx_date >= $1::date)
           AND ($2::date IS NULL OR ops.tx_date <= $2::date)
       )
       SELECT count(*) FILTER (WHERE trade_type = 'buy')::int AS buys,
              count(*) FILTER (WHERE trade_type = 'sell')::int AS sells,
              coalesce(sum(midpoint) FILTER (WHERE trade_type = 'buy'), 0)::float8 AS buy_value,
              coalesce(sum(midpoint) FILTER (WHERE trade_type = 'sell'), 0)::float8 AS sell_value
       FROM scored`,
      params,
    ),
    query<{ name: string }>(
      `SELECT cleaned AS name
       FROM (
         SELECT regexp_replace(btrim(asset), '\\s+-\\s+.*$', '') AS cleaned
         FROM senate_trades
         WHERE upper(btrim(ticker)) = $1
         UNION ALL
         SELECT regexp_replace(btrim(asset), '\\s+-\\s+.*$', '')
         FROM house_trades
         WHERE upper(btrim(ticker)) = $1
       ) AS names
       WHERE cleaned <> ''
         AND cleaned !~* 'F S :'
         AND cleaned !~* 'filing'
         AND cleaned !~* 'status'
         AND cleaned !~* 'tatus'
         AND cleaned !~* 'holding'
         AND cleaned !~* 'appendix'
         AND cleaned !~ '^\\d'
       GROUP BY cleaned
       ORDER BY count(*) DESC, length(cleaned) ASC, cleaned ASC
       LIMIT 1`,
      [ticker],
    ),
    query<CompanyTrade>(
      `SELECT member, chamber, trade_type, amount,
              tx_date::text AS tx_date, disclosed::text AS disclosed, link
       FROM (
         SELECT member, chamber, trade_type, amount, tx_date, disclosed, link, ticker, id
         FROM senate_trades
         UNION ALL
         SELECT member, chamber, trade_type, amount, tx_date, disclosed, link, ticker, id
         FROM house_trades
       ) AS ops
       WHERE upper(btrim(ticker)) = $3
         AND ($1::date IS NULL OR tx_date >= $1::date)
         AND ($2::date IS NULL OR tx_date <= $2::date)
       ORDER BY tx_date DESC NULLS LAST, disclosed DESC, id DESC
       LIMIT 40`,
      params,
    ),
  ]);
  const row = summary[0];
  return {
    ticker,
    name: nameRow[0]?.name?.trim() || ticker,
    buys: Number(row?.buys ?? 0),
    sells: Number(row?.sells ?? 0),
    buy_value: Number(row?.buy_value ?? 0),
    sell_value: Number(row?.sell_value ?? 0),
    trades,
  };
}

export type BiggestBuyerPeriod = "week" | "month" | "year";

export const BIGGEST_BUYER_DAYS: Record<BiggestBuyerPeriod, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export type BiggestBuyer = {
  member: string;
  chambers: string[];
  ticker: string;
  company: string;
  count: number;
  value: number;
  from: string;
  to: string;
  period: BiggestBuyerPeriod;
};

export function parseBiggestBuyerPeriod(value: unknown): BiggestBuyerPeriod | null {
  if (value === undefined || value === null || value === "") return "week";
  if (value === "week" || value === "month" || value === "year") return value;
  return null;
}

export async function queryBiggestBuyer(period: BiggestBuyerPeriod): Promise<BiggestBuyer | null> {
  const days = BIGGEST_BUYER_DAYS[period];
  const rows = await query<{
    member: string;
    chambers: unknown;
    ticker: string;
    company: string | null;
    count: number | string | bigint;
    value: number | string | bigint;
    from: string;
    to: string;
  }>(
    `WITH scored AS (
       SELECT btrim(ops.member) AS member,
              ops.chamber,
              upper(btrim(ops.ticker)) AS ticker,
              regexp_replace(btrim(ops.asset), '\\s+-\\s+.*$', '') AS cleaned,
              valued.midpoint,
              CURRENT_DATE - $1::int AS range_from,
              CURRENT_DATE AS range_to
       FROM (
         SELECT member, chamber, ticker, asset, trade_type, amount, tx_date FROM senate_trades
         UNION ALL
         SELECT member, chamber, ticker, asset, trade_type, amount, tx_date FROM house_trades
       ) AS ops
       ${AMOUNT_MIDPOINT}
       WHERE btrim(ops.ticker) <> ''
         AND btrim(ops.member) <> ''
         AND lower(btrim(ops.trade_type)) = 'buy'
         AND ops.tx_date >= CURRENT_DATE - $1::int
     ), labels AS (
       SELECT ticker, cleaned, count(*) AS uses
       FROM scored
       WHERE cleaned <> ''
         AND cleaned !~* 'F S :'
         AND cleaned !~* 'filing'
         AND cleaned !~* 'status'
         AND cleaned !~* 'tatus'
         AND cleaned !~* 'holding'
         AND cleaned !~* 'appendix'
         AND cleaned !~ '^\\d'
       GROUP BY ticker, cleaned
     ), names AS (
       SELECT DISTINCT ON (ticker) ticker, cleaned AS name
       FROM labels
       ORDER BY ticker, uses DESC, length(cleaned) ASC, cleaned ASC
     )
     SELECT min(scored.member) AS member,
            array_agg(DISTINCT scored.chamber ORDER BY scored.chamber) AS chambers,
            scored.ticker AS ticker,
            names.name AS company,
            count(*)::int AS count,
            coalesce(sum(scored.midpoint), 0)::float8 AS value,
            min(scored.range_from)::text AS from,
            min(scored.range_to)::text AS to
     FROM scored
     LEFT JOIN names ON names.ticker = scored.ticker
     GROUP BY scored.ticker, lower(scored.member), names.name
     HAVING coalesce(sum(scored.midpoint), 0) > 0
     ORDER BY value DESC, min(scored.member) ASC, scored.ticker ASC
     LIMIT 1`,
    [days],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    member: row.member,
    chambers: asChambers(row.chambers),
    ticker: row.ticker,
    company: row.company?.trim() || row.ticker,
    count: Number(row.count),
    value: Number(row.value),
    from: row.from,
    to: row.to,
    period,
  };
}

export async function queryMembers(nameQuery: string | null) {
  const rows = await query<PublicMember>(
    `SELECT name, array_agg(DISTINCT chamber ORDER BY chamber) AS chambers
     FROM (
       SELECT btrim(member) AS name, chamber FROM senate_trades
       UNION
       SELECT btrim(member) AS name, chamber FROM house_trades
     ) AS people
     WHERE name <> ''
       AND ($1::text IS NULL OR name ILIKE $1 ESCAPE '\\')
     GROUP BY name
     ORDER BY name ASC`,
    [nameQuery === null ? null : likeContains(nameQuery)],
  );
  return { total: rows.length, names: rows };
}

export async function loadHealth() {
  const freshness = await loadFreshness();
  const [senateFilings, senateTrades, houseFilings, houseTrades, state] = await Promise.all([
    getPrisma().senateFiling.count(),
    getPrisma().senateTrade.count(),
    getPrisma().houseFiling.count(),
    getPrisma().houseTrade.count(),
    query<{ last_error: string | null; backfill_completed_at: Date | null }>(
      "SELECT last_error, backfill_completed_at FROM scrape_state WHERE id = 1",
    ),
  ]);
  return {
    data_current: freshness.dataCurrent,
    cache_loading: freshness.cacheLoading,
    last_updated: freshness.lastUpdated,
    data_lag_minutes: freshness.dataLagMinutes,
    next_refresh_in_minutes: freshness.nextRefreshInMinutes,
    filings: senateFilings + houseFilings,
    trades: senateTrades + houseTrades,
    senate_filings: senateFilings,
    senate_trades: senateTrades,
    house_filings: houseFilings,
    house_trades: houseTrades,
    last_error: state[0]?.last_error ?? null,
    backfill_completed: Boolean(state[0]?.backfill_completed_at),
  };
}

async function loadFreshness(): Promise<Freshness> {
  const state = await query<{
    backfill_completed_at: Date | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_started_at: Date | null;
  }>("SELECT backfill_completed_at, last_success_at, last_error, last_started_at FROM scrape_state WHERE id = 1");
  const row = state[0];
  return buildFreshness(
    {
      backfillCompletedAt: row?.backfill_completed_at ?? null,
      lastSuccessAt: row?.last_success_at ?? null,
      lastError: row?.last_error ?? null,
      lastStartedAt: row?.last_started_at ?? null,
    },
    runningStepCount(),
  );
}
