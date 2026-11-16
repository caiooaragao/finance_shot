"use client";

import { useEffect, useState } from "react";

type Period = "week" | "month" | "year";

type BiggestBuyer = {
  member: string;
  chambers: string[];
  ticker: string;
  company: string;
  count: number;
  value: number;
  from: string;
  to: string;
  period: Period;
};

type Payload = {
  period?: Period;
  buyer: BiggestBuyer | null;
};

const PERIODS: { id: Period; label: string; title: string }[] = [
  { id: "week", label: "Semana", title: "Maior comprador da semana" },
  { id: "month", label: "Mês", title: "Maior comprador do mês" },
  { id: "year", label: "Ano", title: "Maior comprador do ano" },
];

export function BiggestBuyer() {
  const [period, setPeriod] = useState<Period>("week");
  const [buyer, setBuyer] = useState<BiggestBuyer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/spotlight/biggest-buyer?period=${period}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `HTTP ${response.status}`;
          throw new Error(message);
        }
        const body = payload as Partial<Payload>;
        setBuyer(body.buyer ?? null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setBuyer(null);
        setError(reason instanceof Error ? reason.message : "falha no destaque");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  const title = PERIODS.find((item) => item.id === period)?.title ?? "Maior comprador";
  const firstLoad = loading && !buyer && !error;

  return (
    <section className="flex min-h-40 flex-col overflow-hidden rounded-xl bg-panel p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período do maior comprador">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              onClick={() => {
                if (period === item.id) return;
                setBuyer(null);
                setLoading(true);
                setPeriod(item.id);
              }}
              className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                period === item.id
                  ? "bg-panel-high text-mint hover:brightness-110"
                  : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {firstLoad ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-panel-low" />
          <div className="h-4 w-32 animate-pulse rounded-lg bg-panel-low" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-panel-low" />
        </div>
      ) : null}
      {!firstLoad && !error && !buyer && !loading ? (
        <p className="flex min-h-0 flex-1 items-center text-[13px] text-ink-dim">
          Nenhuma compra com valor estimado neste período.
        </p>
      ) : null}
      {!firstLoad && buyer ? (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[18px] font-semibold tracking-tight">{buyer.member}</p>
            <p className="font-mono text-[10px] tracking-wider text-line uppercase">
              {buyer.chambers.join(" · ") || "congresso"}
            </p>
          </div>
          <div className="flex items-end justify-between gap-3 rounded-lg bg-panel-low px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{buyer.company}</span>
              <span className="font-mono text-[10px] tracking-wider text-line uppercase">${buyer.ticker}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-[16px] font-bold text-mint">{formatUsd(buyer.value)}</span>
              <span className="font-mono text-[10px] text-line">
                {formatCount(buyer.count)} {buyer.count === 1 ? "compra" : "compras"} · estimado
              </span>
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}
