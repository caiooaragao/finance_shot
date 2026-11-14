import assert from "node:assert/strict";
import test from "node:test";

import { parseHousePtrText } from "./parse-ptr";

const RECENT = `
SP Albemarle Corporation (ALB) [ST] S 12/21/2023 01/08/2024 $1,001 - $15,000
SP Charles Schwab Corporation (SCHW)
[ST]
P 12/14/2023 01/08/2024 $50,001 -
$100,000
SP NextEra Energy, Inc. (NEE) [ST] S 12/21/2023 01/08/2024 $15,001 -
$50,000
`;

const OLD = `
sP
Hill International, Inc. (HIl) s 12/26/2013 12/30/2013 $15,001 - $50,000
JT
Dunkin' Brands group, Inc.  (DNKN)s 05/22/2014 05/22/2014 $1,001 - $15,000
JT
gigamon Inc. (gIMO) s 05/22/2014 05/22/2014 $1,001 - $15,000
`;

test("lê transações dos PDFs novos e antigos da Câmara", () => {
  const recent = parseHousePtrText(RECENT);
  assert.deepEqual(recent.map((row) => [row.ticker, row.tradeType, row.txDate, row.amount]), [
    ["ALB", "sell", "2023-12-21", "$1,001 - $15,000"],
    ["SCHW", "buy", "2023-12-14", "$50,001 - $100,000"],
    ["NEE", "sell", "2023-12-21", "$15,001 - $50,000"],
  ]);
  assert.equal(recent[1]?.asset, "Charles Schwab Corporation");

  const old = parseHousePtrText(OLD);
  assert.deepEqual(old.map((row) => [row.ticker, row.tradeType]), [
    ["HIL", "sell"],
    ["DNKN", "sell"],
    ["GIMO", "sell"],
  ]);
});
