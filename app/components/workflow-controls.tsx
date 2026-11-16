"use client";

import { useActionState } from "react";

import { cancelWorkflowAction, retryWorkflowStep } from "@/app/actions/workflow";
import type { ServiceResult } from "@/server/services/gateway";

function outcome(state: ServiceResult<unknown> | null) {
  if (!state) return null;
  if (!state.ok) return state.error;
  if (!state.data || typeof state.data !== "object") return "concluído";
  if ("message" in state.data && typeof state.data.message === "string") return state.data.message;
  if ("status" in state.data && typeof state.data.status === "string") return state.data.status;
  return "concluído";
}

export function WorkflowControls() {
  const [retryState, retryAction, retryPending] = useActionState(retryWorkflowStep, null);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelWorkflowAction, null);

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Operações internas</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        O scrape não é disparado por HTTP. Na VPS use cron com{" "}
        <code className="text-xs">npm run scrape:incremental</code> ou{" "}
        <code className="text-xs">WORKFLOW_AUTORUN=true</code> na subida do app.
      </p>
      <form action={retryAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="h-11 rounded-full border border-black/[.08] bg-transparent px-4 text-sm dark:border-white/[.145]"
          name="stepId"
          placeholder="id da etapa"
          aria-label="Etapa para reabrir"
        />
        <button
          className="h-11 cursor-pointer rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          type="submit"
          disabled={retryPending}
        >
          {retryPending ? "Reabrindo…" : "Reabrir etapa"}
        </button>
      </form>
      <ActionNote label="Reabrir" state={outcome(retryState)} />
      <form action={cancelAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="h-11 rounded-full border border-black/[.08] bg-transparent px-4 text-sm dark:border-white/[.145]"
          name="stepId"
          placeholder="id da etapa"
          aria-label="Etapa para cancelar"
        />
        <button
          className="h-11 cursor-pointer rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          type="submit"
          disabled={cancelPending}
        >
          {cancelPending ? "Cancelando…" : "Cancelar etapa"}
        </button>
      </form>
      <ActionNote label="Cancelar" state={outcome(cancelState)} />
    </section>
  );
}

function ActionNote({ label, state }: { label: string; state: string | null }) {
  if (!state) return null;
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      {label}: {state}
    </p>
  );
}