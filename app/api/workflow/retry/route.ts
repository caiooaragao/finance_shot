import { connection } from "next/server";

import { retryWorkflow } from "@/server/services/gateway";
import { toResponse } from "../../respond";

async function retry(request: Request) {
  await connection();
  const body = (await request.json().catch(() => ({}))) as { stepId?: string };
  return toResponse(await retryWorkflow(body.stepId ?? ""));
}

export async function POST(request: Request) {
  return retry(request);
}

export async function PUT(request: Request) {
  return retry(request);
}
