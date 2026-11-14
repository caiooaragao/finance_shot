"use server";

import { listTrades } from "@/server/services/gateway";

export async function loadRecentTrades(search: URLSearchParams | number = 50) {
  if (typeof search === "number") {
    return listTrades(new URLSearchParams({ limit: String(search) }));
  }
  const params = new URLSearchParams(search);
  if (!params.has("limit")) params.set("limit", "50");
  return listTrades(params);
}
