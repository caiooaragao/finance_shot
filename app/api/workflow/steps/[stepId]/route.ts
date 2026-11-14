import { connection } from "next/server";

import { cancelWorkflowStep, readWorkflowStep, retryWorkflow } from "@/server/services/gateway";
import { toResponse } from "../../../respond";

export async function GET(_request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  await connection();
  const { stepId } = await params;
  return toResponse(await readWorkflowStep(stepId));
}

export async function PUT(_request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  await connection();
  const { stepId } = await params;
  return toResponse(await retryWorkflow(stepId));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  await connection();
  const { stepId } = await params;
  return toResponse(await cancelWorkflowStep(stepId));
}
