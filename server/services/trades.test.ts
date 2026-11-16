import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnvelope,
  buildFreshness,
  ENVELOPE_KEYS,
  parseLeaderDates,
  parseLeaderMetric,
  parseMemberSearch,
  parseTradeQuery,
  TRADE_KEYS,
} from "./trades";

test("envelope de trades segue a CongressInvests", () => {
  const freshness = buildFreshness(
    {
      backfillCompletedAt: new Date("2026-11-01T00:00:00Z"),
      lastSuccessAt: new Date("2026-11-12T12:00:00Z"),
      lastError: null,
      lastStartedAt: new Date("2026-11-12T11:00:00Z"),
    },
    0,
    new Date("2026-11-12T15:00:00Z"),
  );
  const body = buildEnvelope({
    total: 2,
    offset: 0,
    limit: 1,
    trades: [
      {
        member: "Jane Doe",
        chamber: "Senate",
        ticker: "NVDA",
        trade_type: "buy",
        amount: "$1,001 - $15,000",
        tx_date: "2024-05-15",
        disclosed: "2024-06-10",
        asset: "NVIDIA Corp",
        link: "https://efdsearch.senate.gov/search/view/ptr/11111111-1111-1111-1111-111111111111/",
      },
    ],
    freshness,
  });
  for (const key of ENVELOPE_KEYS) assert.equal(key in body, true);
  for (const key of TRADE_KEYS) assert.equal(key in body.trades[0], true);
  assert.equal(body.has_more, true);
  assert.equal(body.data_current, true);
  assert.equal(body.data_lag_minutes, 180);
  assert.equal("chamber" in body, false);
});

test("parseTradeQuery lê filtros da tabela e ignora datas inválidas", () => {
  const query = parseTradeQuery(
    new URLSearchParams({
      member: " Jane ",
      company: "NVIDIA",
      ticker: "nvda",
      trade_type: "buy",
      amount: "15,000",
      date_from: "2024-05-01",
      date_to: "not-a-date",
      disclosed_from: "2024-06-01",
      q: "senate",
      days: "30",
      limit: "20",
      offset: "10",
    }),
  );
  assert.equal(query.member, "Jane");
  assert.equal(query.asset, "NVIDIA");
  assert.equal(query.ticker, "nvda");
  assert.equal(query.tickerExact, false);
  assert.equal(query.tradeType, "buy");
  assert.equal(query.amount, "15,000");
  assert.equal(query.txDateFrom, "2024-05-01");
  assert.equal(query.txDateTo, null);
  assert.equal(query.disclosedFrom, "2024-06-01");
  assert.equal(query.q, "senate");
  assert.equal(query.days, 30);
  assert.equal(query.limit, 20);
  assert.equal(query.offset, 10);
});

test("parseTradeQuery usa ticker do path com match exato", () => {
  const query = parseTradeQuery(new URLSearchParams({ ticker: "AAPL" }), "nvda");
  assert.equal(query.ticker, "NVDA");
  assert.equal(query.tickerExact, true);
  assert.equal(query.memberExact, false);
});

test("parseLeaderDates aceita o período e rejeita data inválida", () => {
  assert.deepEqual(parseLeaderDates({}), { from: null, to: null });
  assert.deepEqual(parseLeaderDates({ from: "2024-01-01", to: "2024-12-31" }), {
    from: "2024-01-01",
    to: "2024-12-31",
  });
  assert.deepEqual(parseLeaderDates({ tx_date_from: "2020-05-02" }), { from: "2020-05-02", to: null });
  assert.equal(parseLeaderDates({ from: "ontem" }), null);
  assert.equal(parseLeaderDates({ to: 2024 }), null);
});

test("parseLeaderMetric aceita as medidas do gráfico", () => {
  assert.equal(parseLeaderMetric(undefined), "count");
  assert.equal(parseLeaderMetric(""), "count");
  assert.equal(parseLeaderMetric("notional"), "notional");
  assert.equal(parseLeaderMetric("buy"), "buy");
  assert.equal(parseLeaderMetric("sell"), "sell");
  assert.equal(parseLeaderMetric("dinheiro"), null);
});

test("parseMemberSearch lê q ou name do json e ignora vazio", () => {
  assert.equal(parseMemberSearch({ q: "  Pelosi " }), "Pelosi");
  assert.equal(parseMemberSearch({ name: "Tuberville" }), "Tuberville");
  assert.equal(parseMemberSearch({ q: "   " }), null);
  assert.equal(parseMemberSearch({}), null);
});
