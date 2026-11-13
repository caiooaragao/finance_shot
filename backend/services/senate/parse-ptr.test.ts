import assert from "node:assert/strict";
import test from "node:test";

import { toIsoDate } from "../../lib/dates";
import { cleanTicker, normalizeOrderType, toTrade } from "./normalize";
import { parsePtrHtml } from "./parse-ptr";

const FIXTURE = `
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Transaction Date</th>
      <th>Owner</th>
      <th>Ticker</th>
      <th>Asset Name</th>
      <th>Asset Type</th>
      <th>Type</th>
      <th>Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td><td>05/15/2024</td><td>Self</td><td>NVDA</td>
      <td>NVIDIA Corp</td><td>Stock</td><td>Purchase</td><td>$1,001 - $15,000</td>
    </tr>
    <tr>
      <td>2</td><td>06/01/2024</td><td>Spouse</td><td>--</td>
      <td>Some Bond</td><td>Municipal Security</td><td>Sale (Partial)</td><td>$15,001 - $50,000</td>
    </tr>
    <tr>
      <td>3</td><td>06/02/2024</td><td>Self</td><td>AAPL</td>
      <td>Apple Inc</td><td>Stock</td><td>Exchange</td><td>$1,001 - $15,000</td>
    </tr>
  </tbody>
</table>`;

test("parser e normalização de PTR", () => {
  const rows = parsePtrHtml(FIXTURE);
  assert.equal(rows.length, 3);
  const filing = {
    id: "11111111-1111-1111-1111-111111111111",
    member: "Jane Doe",
    disclosed: "2024-06-10",
    link: "https://efdsearch.senate.gov/search/view/ptr/11111111-1111-1111-1111-111111111111/",
  };
  const trades = rows.map((row, index) => toTrade(row, filing, index));
  assert.equal(trades[0]?.tradeType, "buy");
  assert.equal(trades[0]?.ticker, "NVDA");
  assert.equal(trades[0]?.txDate, "2024-05-15");
  assert.equal(trades[0]?.chamber, "Senate");
  assert.equal(trades[1]?.tradeType, "sell");
  assert.equal(trades[1]?.ticker, "");
  assert.equal(trades[2]?.tradeType, "exchange");
  assert.equal(cleanTicker("--"), "");
  assert.equal(normalizeOrderType("Sale (Full)"), "sell");
  assert.equal(toIsoDate("01/02/2024 00:00:00"), "2024-01-02");
  assert.notEqual(trades[0]?.id, trades[1]?.id);
});
