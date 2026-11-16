import { connection } from "next/server";

import { getBiggestBuyer } from "@/server/services/gateway";
import { toResponse } from "../../respond";

export async function GET(request: Request) {
  await connection();
  const period = new URL(request.url).searchParams.get("period");
  return toResponse(await getBiggestBuyer(period));
}
