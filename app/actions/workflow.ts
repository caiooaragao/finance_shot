"use server";

import { revalidatePath } from "next/cache";

import {
  advanceWorkflow,
  cancelWorkflowStep,
  readWorkflow,
  retryWorkflow,
  runScrape,
  type ServiceResult,
} from "@/server/services/gateway";

export async function loadWorkflow() {
  return readWorkflow();
}

export async function tickWorkflow(_prev: ServiceResult<unknown> | null, _formData: FormData) {
  const result = await advanceWorkflow();
  revalidatePath("/");
  return result;
}

export async function scrapeWorkflow(_prev: ServiceResult<unknown> | null, _formData: FormData) {
  const result = await runScrape();
  revalidatePath("/");
  return result;
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
