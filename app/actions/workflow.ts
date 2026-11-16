"use server";

import { revalidatePath } from "next/cache";

import {
  cancelWorkflowStep,
  readWorkflow,
  retryWorkflow,
  type ServiceResult,
} from "@/server/services/gateway";

export async function loadWorkflow() {
  return readWorkflow();
}

export async function retryWorkflowStep(_prev: ServiceResult<unknown> | null, formData: FormData) {
  const result = await retryWorkflow(String(formData.get("stepId") ?? ""));
  revalidatePath("/");
  return result;
}

export async function cancelWorkflowAction(_prev: ServiceResult<unknown> | null, formData: FormData) {
  const result = await cancelWorkflowStep(String(formData.get("stepId") ?? ""));
  revalidatePath("/");
  return result;
}
