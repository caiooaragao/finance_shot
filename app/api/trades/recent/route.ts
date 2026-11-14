import { connection } from "next/server";

import { listTrades } from "@/server/services/gateway";
import { toResponse } from "../../respond";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  return toResponse(await listTrades(url.searchParams));
}
