import assert from "node:assert/strict";
import test from "node:test";

import { buildEnvelope, buildFreshness, ENVELOPE_KEYS, TRADE_KEYS } from "./trades";

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
