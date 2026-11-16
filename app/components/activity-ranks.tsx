"use client";

import { useEffect, useState } from "react";

import { PanelSwap, runPanelSwap } from "./panel-swap";

type CompanyMetric = "buy" | "sell" | "buy_value" | "sell_value";

type Company = {
  ticker: string;
  name: string;
  count: number;
  value: number;
};

type LeadersResponse = {
  total: number;
  metric?: CompanyMetric;
  leaders: Company[];
};

type CompanyTrade = {
  member: string;
  chamber: string;
  trade_type: string;
  amount: string;
  tx_date: string | null;
  disclosed: string;
  link: string;
};

type CompanyDetail = {
  ticker: string;
  name: string;
  buys: number;
  sells: number;
  buy_value: number;
  sell_value: number;
  trades: CompanyTrade[];
};

type PeriodId = "7" | "30" | "90" | "180" | "all";

type Side = {
  metric: "buy" | "sell";
  title: string;
  countUnit: string;
  valueUnit: string;
  tone: string;
};

const SIDES: Side[] = [
  { metric: "buy", title: "Maiores compras", countUnit: "compras", valueUnit: "comprados", tone: "text-mint" },
  { metric: "sell", title: "Maiores vendas", countUnit: "vendas", valueUnit: "vendidos", tone: "text-danger" },
];

const PERIODS: { id: PeriodId; label: string; days: number | null }[] = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "180", label: "180 dias", days: 180 },
  { id: "all", label: "Todos", days: null },
];

const EMPTY_BOARD: LeadersResponse = { total: 0, leaders: [] };

export function ActivityRanks() {
  const [period, setPeriod] = useState<PeriodId>("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const [buyByValue, setBuyByValue] = useState(false);
  const [sellByValue, setSellByValue] = useState(false);
  const [boards, setBoards] = useState<Record<"buy" | "sell", LeadersResponse>>({
    buy: EMPTY_BOARD,
    sell: EMPTY_BOARD,
  });
  const [buyLoading, setBuyLoading] = useState(true);
  const [sellLoading, setSellLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const buyMetric: CompanyMetric = buyByValue ? "buy_value" : "buy";
  const sellMetric: CompanyMetric = sellByValue ? "sell_value" : "sell";

  useEffect(() => {
    const controller = new AbortController();
    setBuyLoading(true);
    setError(null);
    postLeaders(buyMetric, range, controller.signal)
      .then((buy) => {
        if (!controller.signal.aborted) setBoards((current) => ({ ...current, buy }));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setError(reason instanceof Error ? reason.message : "falha no ranking");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBuyLoading(false);
      });
    return () => controller.abort();
  }, [buyMetric, range]);

  useEffect(() => {
    const controller = new AbortController();
    setSellLoading(true);
    setError(null);
    postLeaders(sellMetric, range, controller.signal)
      .then((sell) => {
        if (!controller.signal.aborted) setBoards((current) => ({ ...current, sell }));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setError(reason instanceof Error ? reason.message : "falha no ranking");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSellLoading(false);
      });
    return () => controller.abort();
  }, [sellMetric, range]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    postDetail(selected, range, controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted) setDetail(payload);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setDetail(null);
        setDetailError(reason instanceof Error ? reason.message : "falha ao abrir a empresa");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected, range]);

  function applyPeriod(next: PeriodId) {
    const preset = PERIODS.find((item) => item.id === next);
    setBuyLoading(true);
    setSellLoading(true);
    setPeriod(next);
    if (!preset?.days) {
      setRange({ from: "", to: "" });
      return;
    }
    setRange({ from: isoLocalDaysAgo(preset.days), to: isoLocalToday() });
  }

  function openCompany(ticker: string) {
    runPanelSwap(() => {
      setSelected(ticker);
      setDetail(null);
      setDetailError(null);
    });
  }

  function closeCompany() {
    runPanelSwap(() => {
      setSelected(null);
      setDetail(null);
      setDetailError(null);
    });
  }

  return (
    <section className="panel-swap-vt-company flex min-h-0 flex-col overflow-hidden rounded-xl bg-panel p-3">
      <PanelSwap
        activeKey={selected ? `company:${selected}` : "ranks"}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {selected ? (
          <CompanySheet
            ticker={selected}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onBack={closeCompany}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold tracking-tight">Compras e vendas</h2>
              <span className="font-mono text-[10px] tracking-wider text-line uppercase">por empresa</span>
            </div>
            {error ? <p className="text-[12px] text-danger">{error}</p> : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Medida das compras">
                  <button
                    type="button"
                    aria-pressed={!buyByValue}
                    onClick={() => {
                      if (!buyByValue) return;
                      setBuyLoading(true);
                      setBuyByValue(false);
                    }}
                    className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      !buyByValue
                        ? "bg-panel-high text-mint hover:brightness-110"
                        : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                    }`}
                  >
                    Quantidade
                  </button>
                  <button
                    type="button"
                    aria-pressed={buyByValue}
                    onClick={() => {
                      if (buyByValue) return;
                      setBuyLoading(true);
                      setBuyByValue(true);
                    }}
                    className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      buyByValue
                        ? "bg-mint/15 text-mint hover:brightness-110"
                        : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                    }`}
                  >
                    Valor comprado
                  </button>
                </div>
                <RankColumn
                  side={SIDES[0]}
                  board={boards.buy}
                  loading={buyLoading}
                  onOpen={openCompany}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Medida das vendas">
                  <button
                    type="button"
                    aria-pressed={!sellByValue}
                    onClick={() => {
                      if (!sellByValue) return;
                      setSellLoading(true);
                      setSellByValue(false);
                    }}
                    className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      !sellByValue
                        ? "bg-panel-high text-mint hover:brightness-110"
                        : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                    }`}
                  >
                    Quantidade
                  </button>
                  <button
                    type="button"
                    aria-pressed={sellByValue}
                    onClick={() => {
                      if (sellByValue) return;
                      setSellLoading(true);
                      setSellByValue(true);
                    }}
                    className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      sellByValue
                        ? "bg-danger/15 text-danger hover:brightness-110"
                        : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                    }`}
                  >
                    Valor vendido
                  </button>
                </div>
                <RankColumn
                  side={SIDES[1]}
                  board={boards.sell}
                  loading={sellLoading}
                  onOpen={openCompany}
                />
              </div>
            </div>
            <footer className="flex flex-col gap-2">
              <p className="font-mono text-[10px] text-line">
                O número é a quantidade de operações. Com valor, é o ponto médio da faixa divulgada.
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período das empresas">
                {PERIODS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={period === item.id}
                    onClick={() => applyPeriod(item.id)}
                    className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      period === item.id
                        ? "bg-panel-high text-mint hover:brightness-110"
                        : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                    }`}
                  >
                    {item.days ? `Últimos ${item.label}` : item.label}
                  </button>
                ))}
              </div>
            </footer>
          </div>
        )}
      </PanelSwap>
    </section>
  );
}

function RankColumn({
  side,
  board,
  loading,
  onOpen,
}: {
  side: Side;
  board: LeadersResponse;
  loading: boolean;
  onOpen: (ticker: string) => void;
}) {
  const byValue = board.metric === "buy_value" || board.metric === "sell_value";
  const unit = byValue ? side.valueUnit : side.countUnit;
  const firstLoad = loading && board.leaders.length === 0;
  const refreshing = loading && board.leaders.length > 0;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2" aria-busy={loading}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`text-[13px] font-semibold ${side.tone}`}>{side.title}</h3>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-line">
          {firstLoad ? "…" : `${byValue ? formatUsd(board.total) : formatCount(board.total)} ${unit}`}
          {refreshing ? <ColumnSpinner /> : null}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <ul
          className={`flex max-h-80 min-h-0 flex-col gap-1 overflow-auto lg:max-h-none lg:h-full ${
            refreshing ? "pointer-events-none opacity-45" : ""
          }`}
        >
          {firstLoad
            ? Array.from({ length: 6 }, (_, index) => (
                <li key={index} className="h-10 animate-pulse rounded-lg bg-panel-low" />
              ))
            : null}
          {!firstLoad && board.leaders.length === 0 ? (
            <li className="px-2 py-6 text-center text-[13px] text-ink-dim">Nenhuma empresa nesse recorte.</li>
          ) : null}
          {!firstLoad
            ? board.leaders.map((company, index) => (
                <li key={company.ticker}>
                  <button
                    type="button"
                    onClick={() => onOpen(company.ticker)}
                    className="flex w-full items-center gap-2 rounded-lg bg-panel-low px-2 py-1.5 text-left transition-colors hover:bg-panel-high"
                  >
                    <span className="w-6 shrink-0 font-mono text-[11px] font-bold text-line">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{company.name}</span>
                      <span className="font-mono text-[10px] tracking-wider text-line uppercase">{company.ticker}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-mono text-[12px] font-bold ${side.tone}`}>
                        {byValue ? formatUsd(company.value) : formatCount(company.value)}
                      </span>
                      <span className="font-mono text-[10px] text-line">{byValue ? "estimado" : "ops"}</span>
                    </span>
                  </button>
                </li>
              ))
            : null}
        </ul>
        {refreshing ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-lg bg-panel/90 px-2 py-1">
              <ColumnSpinner />
              <span className="font-mono text-[10px] tracking-wider text-line uppercase">Atualizando</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ColumnSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-transparent"
      role="status"
      aria-label="Atualizando"
    />
  );
}

function CompanySheet({
  ticker,
  detail,
  loading,
  error,
  onBack,
}: {
  ticker: string;
  detail: CompanyDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const name = detail?.name || ticker;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-canvas px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-panel-high"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-line" fill="currentColor">
            <path
              d="M11.5 5.5 7 10l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Voltar
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{name}</span>
          <span className="font-mono text-[10px] tracking-wider text-line uppercase">{ticker}</span>
        </span>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Compras" value={loading || !detail ? "…" : formatCount(detail.buys)} tone="text-mint" />
        <Stat label="Vendas" value={loading || !detail ? "…" : formatCount(detail.sells)} tone="text-danger" />
        <Stat label="Valor comprado" value={loading || !detail ? "…" : formatUsd(detail.buy_value)} tone="text-mint" />
        <Stat label="Valor vendido" value={loading || !detail ? "…" : formatUsd(detail.sell_value)} tone="text-danger" />
      </div>
      <p className="font-mono text-[10px] text-line">Valores são o ponto médio da faixa divulgada.</p>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-panel font-mono text-[10px] tracking-wider text-line uppercase">
            <tr>
              <th className="px-2 py-1 font-bold">Data</th>
              <th className="px-2 py-1 font-bold">Tipo</th>
              <th className="px-2 py-1 font-bold">Pessoa</th>
              <th className="px-2 py-1 text-right font-bold">Faixa</th>
            </tr>
          </thead>
          <tbody>
            {loading && !detail ? (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-[13px] text-ink-dim">
                  Abrindo a empresa…
                </td>
              </tr>
            ) : null}
            {detail && detail.trades.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-[13px] text-ink-dim">
                  Nenhuma operação nesse recorte.
                </td>
              </tr>
            ) : null}
            {detail?.trades.map((trade, index) => (
              <tr key={`${trade.link}-${trade.tx_date}-${trade.member}-${index}`} className="border-t border-canvas">
                <td className="px-2 py-1.5 font-mono text-[11px] whitespace-nowrap">{formatDate(trade.tx_date)}</td>
                <td className="px-2 py-1.5">
                  <TypeBadge type={trade.trade_type} />
                </td>
                <td className="max-w-36 px-2 py-1.5">
                  <span className="block truncate text-[12px]">{trade.member || "—"}</span>
                  <span className="font-mono text-[10px] tracking-wider text-line uppercase">{trade.chamber || "—"}</span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] whitespace-nowrap">{trade.amount || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-panel-low px-2 py-1.5">
      <span className="block font-mono text-[10px] tracking-wider text-line uppercase">{label}</span>
      <span className={`font-mono text-[13px] font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const tone =
    normalized === "buy"
      ? "bg-mint/15 text-mint"
      : normalized === "sell"
        ? "bg-danger/15 text-danger"
        : "bg-amber/15 text-amber";
  const label = normalized === "buy" ? "BUY" : normalized === "sell" ? "SELL" : normalized === "exchange" ? "EXCH" : type || "—";
  return <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${tone}`}>{label}</span>;
}

async function postLeaders(
  metric: CompanyMetric,
  range: { from: string; to: string },
  signal: AbortSignal,
): Promise<LeadersResponse> {
  const payload = await postJson("/api/companies/leaders", { metric, from: range.from, to: range.to }, signal);
  const body = payload as Partial<LeadersResponse>;
  return {
    total: typeof body.total === "number" ? body.total : 0,
    metric: body.metric,
    leaders: Array.isArray(body.leaders) ? body.leaders : [],
  };
}

async function postDetail(
  ticker: string,
  range: { from: string; to: string },
  signal: AbortSignal,
): Promise<CompanyDetail> {
  const payload = await postJson("/api/companies/detail", { ticker, from: range.from, to: range.to }, signal);
  const body = payload as Partial<CompanyDetail>;
  return {
    ticker: typeof body.ticker === "string" ? body.ticker : ticker,
    name: typeof body.name === "string" ? body.name : ticker,
    buys: typeof body.buys === "number" ? body.buys : 0,
    sells: typeof body.sells === "number" ? body.sells : 0,
    buy_value: typeof body.buy_value === "number" ? body.buy_value : 0,
    sell_value: typeof body.sell_value === "number" ? body.sell_value : 0,
    trades: Array.isArray(body.trades) ? body.trades : [],
  };
}

async function postJson(url: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function isoLocalToday(): string {
  return formatIsoLocal(new Date());
}

function isoLocalDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatIsoLocal(date);
}

function formatIsoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
