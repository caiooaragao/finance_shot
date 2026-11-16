import { connection } from "next/server";

import { listCompanyLeaders } from "@/server/services/gateway";
import { readJsonObject, toResponse } from "../../respond";

export async function POST(request: Request) {
  await connection();
  const body = await readJsonObject(request);
  if (!body) return Response.json({ error: "json obrigatório" }, { status: 400 });
  return toResponse(await listCompanyLeaders(body));
}
