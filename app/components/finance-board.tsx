import { connection } from "next/server";

import { loadHealthStatus } from "@/app/actions/health";
import { loadRecentTrades } from "@/app/actions/trades";
import { loadWorkflow } from "@/app/actions/workflow";
import type { PublicTrade } from "@/server/services/trades";
import { filtersFromSearch, TradesFilters } from "./trades-filters";
import { WorkflowControls } from "./workflow-controls";

const TRADE_LABEL: Record<string, string> = {
  buy: "Compra",
  sell: "Venda",
  exchange: "Troca",
};

function toSearchParams(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) search.set(key, first);
  }
  return search;
}

export async function FinanceBoard({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  await connection();
  const search = toSearchParams(await searchParams);
  const [health, trades, workflow] = await Promise.all([
    loadHealthStatus(),
    loadRecentTrades(search),
    loadWorkflow(),
  ]);
  const filters = filtersFromSearch(search);
  const offset = Number(search.get("offset") ?? 0);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-500">Finance Shot</p>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Trades do Congresso
        </h1>
        <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
          A interface, as Server Actions e os endpoints HTTP rodam no mesmo processo do Next.js.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Filings"
          value={String(health.filings)}
          detail={`${health.senate_filings} Senado · ${health.house_filings} Câmara`}
        />
        <Stat
          label="Trades"
          value={String(health.trades)}
          detail={`${health.senate_trades} Senado · ${health.house_trades} Câmara`}
        />
        <Stat label="Dados atuais" value={health.data_current ? "sim" : "não"} />
        <Stat label="Backfill" value={health.backfill_completed ? "sim" : "não"} />
      </section>
      {health.last_error ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Último erro: {health.last_error}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Trades recentes</h2>
          {trades.ok && trades.data.trades.length > 0 ? (
            <p className="text-xs text-zinc-500">
              {trades.data.offset + 1}–{trades.data.offset + trades.data.trades.length} de {trades.data.total}
            </p>
          ) : null}
        </div>
        <TradesFilters filters={filters} total={trades.ok ? trades.data.total : null} />
        {!trades.ok ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{trades.error}</p>
        ) : trades.data.trades.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum trade encontrado para esses filtros.</p>
        ) : (
          <>
            <TradesTable trades={trades.data.trades} />
            <Pagination
              search={search}
              offset={Number.isFinite(offset) ? offset : 0}
              limit={trades.data.limit}
              total={trades.data.total}
              hasMore={trades.data.has_more}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Workflow</h2>
        {!workflow.ok ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{workflow.error}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workflow.data.steps.map((step) => (
              <li key={step.id} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-black dark:text-zinc-50">{step.title}</span>
                <span className="font-mono text-xs text-zinc-500">
                  {step.id} · {step.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WorkflowControls />
    </div>
  );
}

function TradesTable({ trades }: { trades: PublicTrade[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[.08] dark:border-white/[.145]">
      <table className="w-full min-w-[880px] border-collapse text-left text-sm">
        <thead className="bg-zinc-100 text-xs tracking-wide text-zinc-500 uppercase dark:bg-white/[.04]">
          <tr>
            <th className="px-3 py-2 font-medium">Membro</th>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium">Ativo</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Valor</th>
            <th className="px-3 py-2 font-medium">Operação</th>
            <th className="px-3 py-2 font-medium">Divulgado</th>
            <th className="px-3 py-2 font-medium">Relatório</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
          {trades.map((trade, index) => (
            <tr key={`${trade.link}-${trade.ticker}-${trade.tx_date}-${index}`}>
              <td className="px-3 py-2 text-black dark:text-zinc-50">
                {trade.member || "—"}
                <span className="block text-xs text-zinc-500">{trade.chamber === "House" ? "Câmara" : "Senado"}</span>
              </td>
              <td className="px-3 py-2 font-medium text-black dark:text-zinc-50">{trade.ticker || "—"}</td>
              <td className="max-w-xs px-3 py-2 text-zinc-600 dark:text-zinc-400">{trade.asset || "—"}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                {TRADE_LABEL[trade.trade_type] ?? (trade.trade_type || "—")}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{trade.amount || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{formatDate(trade.tx_date)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{formatDate(trade.disclosed)}</td>
              <td className="px-3 py-2">
                <a
                  className="text-zinc-700 underline underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  href={trade.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  PTR
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  search,
  offset,
  limit,
  total,
  hasMore,
}: {
  search: URLSearchParams;
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}) {
  if (total <= limit) return null;
  const previous = Math.max(0, offset - limit);
  const next = offset + limit;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      {offset > 0 ? (
        <a
          className="text-zinc-700 underline underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          href={hrefForOffset(search, previous)}
        >
          Anterior
        </a>
      ) : (
        <span />
      )}
      {hasMore ? (
        <a
          className="text-zinc-700 underline underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          href={hrefForOffset(search, next)}
        >
          Próxima
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

function hrefForOffset(search: URLSearchParams, offset: number): string {
  const next = new URLSearchParams(search);
  if (offset <= 0) next.delete("offset");
  else next.set("offset", String(offset));
  const query = next.toString();
  return query ? `/?${query}` : "/";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-black/[.08] px-4 py-3 dark:border-white/[.145]">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}
