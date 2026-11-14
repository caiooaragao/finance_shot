import assert from "node:assert/strict";
import test from "node:test";

import type { FilingRef } from "./client";
import { scrapeFilings, shouldDownload } from "./job";

const filing = (id: string): FilingRef => ({
  id,
  paper: false,
  member: "Jane Doe",
  disclosed: "2024-06-10",
  link: `https://efdsearch.senate.gov/search/view/ptr/${id}/`,
});

const html = `<table><tr><td>1</td><td>05/15/2024</td><td>Self</td><td>NVDA</td><td>NVIDIA Corp</td><td>Stock</td><td>Purchase</td><td>$1,001 - $15,000</td></tr></table>`;

test("não baixa filing repetido nem papel", async () => {
  const id = "22222222-2222-2222-2222-222222222222";
  let downloads = 0;
  const stored = new Set<string>();
  const first = await scrapeFilings([filing(id), filing(id), { ...filing(id), id: null, paper: true }], {
    exists: async (value) => stored.has(value),
    download: async () => {
      downloads += 1;
      return html;
    },
    save: async (item) => {
      stored.add(item.id);
      return true;
    },
    delayMs: 0,
  });
  assert.equal(downloads, 1);
  assert.equal(first.added, 1);
  assert.equal(first.paper, 1);

  const second = await scrapeFilings([filing(id)], {
    exists: async (value) => stored.has(value),
    download: async () => {
      downloads += 1;
      return html;
    },
    save: async () => true,
    delayMs: 0,
  });
  assert.equal(second.added, 0);
  assert.equal(downloads, 1);
  assert.equal(shouldDownload({ ...filing(id), paper: true }, false), false);
});
