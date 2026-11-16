"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PanelSwap, runPanelSwap } from "./panel-swap";

type ChartMetric = "count" | "notional" | "buy" | "sell";

type Leader = {
  name: string;
  count: number;
  value?: number;
  chambers: string[];
};

type LeadersResponse = {
  total: number;
  metric?: ChartMetric;
  from: string | null;
  to: string | null;
  leaders: Leader[];
};

type Member = {
  name: string;
  chambers: string[];
};

type Trade = {
  member: string;
  chamber: string;
  ticker: string;
  trade_type: string;
  amount: string;
  tx_date: string | null;
  disclosed: string;
  asset: string;
  link: string;
};

type TradesResponse = {
  name: string;
  total: number;
  trades: Trade[];
};

type Slice = {
  key: string;
  name: string;
  count: number;
  color: string;
};

const COLORS = [
  "#4edea3",
  "#ffb95f",
  "#adc6ff",
  "#ffb4ab",
  "#c4b5fd",
  "#67e8f9",
  "#f9a8d4",
  "#86efac",
  "#fdba74",
  "#93c5fd",
  "#fcd34d",
  "#5eead4",
  "#fca5a5",
  "#a5b4fc",
  "#bbf7d0",
  "#fbcfe8",
  "#bae6fd",
  "#d9f99d",
  "#fecdd3",
  "#ddd6fe",
  "#86948a",
];

const INPUT =
  "h-8 w-full rounded-lg border-0 bg-canvas px-2 font-mono text-[12px] text-ink outline-none placeholder:text-line focus:bg-panel-high";

type PeriodPreset = "7" | "30" | "90" | "180" | "all" | "custom";

const PERIOD_PRESETS: { id: Exclude<PeriodPreset, "custom">; label: string; days?: number }[] = [
  { id: "7", label: "Últimos 7 dias", days: 7 },
  { id: "30", label: "Últimos 30 dias", days: 30 },
  { id: "90", label: "Últimos 90 dias", days: 90 },
  { id: "180", label: "Últimos 180 dias", days: 180 },
  { id: "all", label: "Todos os dias" },
];

export function OperationsBoard() {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [total, setTotal] = useState(0);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);
  const [leadersError, setLeadersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [suggestTotal, setSuggestTotal] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [chartHover, setChartHover] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all");
  const [metric, setMetric] = useState<ChartMetric>("count");
  const [shownMetric, setShownMetric] = useState<ChartMetric>("count");

  useEffect(() => {
    const controller = new AbortController();
    const body: { from?: string; to?: string; metric: ChartMetric } = { metric };
    if (applied.from) body.from = applied.from;
    if (applied.to) body.to = applied.to;
    setLeadersLoading(true);
    setLeadersError(null);
    postJson<LeadersResponse>("/api/members/leaders", body, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setTotal(payload.total ?? 0);
        setLeaders(Array.isArray(payload.leaders) ? payload.leaders : []);
        setShownMetric(payload.metric ?? metric);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setTotal(0);
        setLeaders([]);
        setLeadersError(reason instanceof Error ? reason.message : "falha no ranking");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLeadersLoading(false);
      });
    return () => controller.abort();
  }, [applied, metric]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || q === person) {
      setSuggestions([]);
      setSuggestTotal(0);
      setOpen(false);
      setSuggesting(false);
      return;
    }
    const controller = new AbortController();
    setSuggesting(true);
    setSuggestError(null);
    const timer = window.setTimeout(() => {
      postJson<{ total: number; names: Member[] }>("/api/members/search", { q }, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted) return;
          const names = Array.isArray(payload.names) ? payload.names : [];
          setSuggestions(names);
          setSuggestTotal(payload.total ?? names.length);
          setActive(0);
          setOpen(true);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted || isAbort(reason)) return;
          setSuggestions([]);
          setSuggestTotal(0);
          setOpen(true);
          setSuggestError(reason instanceof Error ? reason.message : "falha na busca");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggesting(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, person]);

  useEffect(() => {
    if (!person) return;
    const controller = new AbortController();
    setTradesLoading(true);
    setTradesError(null);
    postJson<TradesResponse>("/api/members/trades", { name: person, all: true }, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setTrades(Array.isArray(payload.trades) ? payload.trades : []);
        setTradeTotal(payload.total ?? 0);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setTrades([]);
        setTradeTotal(0);
        setTradesError(reason instanceof Error ? reason.message : "falha ao listar operações");
      })
      .finally(() => {
        if (!controller.signal.aborted) setTradesLoading(false);
      });
    return () => controller.abort();
  }, [person]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const slices = useMemo(() => buildSlices(leaders), [leaders]);
  const period =
    applied.from || applied.to
      ? `${applied.from ? formatDate(applied.from) : "início"} – ${applied.to ? formatDate(applied.to) : "hoje"}`
      : "todas as datas";

  function applyDates(event: FormEvent) {
    event.preventDefault();
    if (from && to && from > to) {
      setLeadersError("A data inicial fica depois da final.");
      return;
    }
    setLeadersError(null);
    setApplied({ from, to });
    setPeriodPreset(detectPeriodPreset(from, to));
  }

  function clearDates() {
    setFrom("");
    setTo("");
    setLeadersError(null);
    setApplied({ from: "", to: "" });
    setPeriodPreset("all");
  }

  function applyPeriodPreset(preset: Exclude<PeriodPreset, "custom">) {
    setLeadersError(null);
    if (preset === "all") {
      clearDates();
      return;
    }
    const days = PERIOD_PRESETS.find((item) => item.id === preset)?.days;
    if (!days) return;
    const toDate = isoLocalToday();
    const fromDate = isoLocalDaysAgo(days);
    setFrom(fromDate);
    setTo(toDate);
    setApplied({ from: fromDate, to: toDate });
    setPeriodPreset(preset);
  }

  function choosePerson(name: string) {
    runPanelSwap(() => {
      setQuery(name);
      setPerson(name);
      setOpen(false);
      setSuggestions([]);
    });
  }

  function backToChart() {
    runPanelSwap(() => {
      setPerson(null);
      setQuery("");
      setTrades([]);
      setTradeTotal(0);
      setTradesError(null);
      setChartHover(null);
    });
  }

  function onQueryKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    const shown = suggestions.slice(0, 12);
    if (!open || shown.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(shown.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = shown[active] ?? shown[0];
      if (pick) choosePerson(pick.name);
    }
  }

  const visible = suggestions.slice(0, 12);

  return (
    <section className="panel-swap-vt order-0 flex min-h-[28rem] flex-col gap-4 rounded-xl bg-panel p-3">
      <PanelSwap
        activeKey={person ? `detail:${person}` : "chart"}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
      {person ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg bg-panel-low">
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
            <button
              type="button"
              onClick={backToChart}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-canvas px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-panel-high"
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
              Voltar ao gráfico
            </button>
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{person}</h3>
            <span className="font-mono text-[10px] text-line">
              {tradesLoading ? "Carregando…" : `${formatCount(tradeTotal)} operações`}
            </span>
          </div>
          {tradesError ? <p className="px-3 text-[12px] text-danger">{tradesError}</p> : null}
          <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 z-[1] bg-panel-low font-mono text-[10px] tracking-wider text-line uppercase">
                <tr>
                  <th className="px-3 py-2 font-bold">Operação</th>
                  <th className="px-3 py-2 font-bold">Divulgação</th>
                  <th className="px-3 py-2 text-center font-bold">Tipo</th>
                  <th className="px-3 py-2 font-bold">Ticker</th>
                  <th className="px-3 py-2 font-bold">Ativo</th>
                  <th className="px-3 py-2 text-right font-bold">Valor</th>
                  <th className="px-3 py-2 font-bold">Câmara</th>
                  <th className="px-3 py-2 text-center font-bold">PTR</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-ink-dim">
                      {tradesLoading ? "Listando todas as operações…" : "Nenhuma operação para essa pessoa."}
                    </td>
                  </tr>
                ) : (
                  trades.map((trade, index) => (
                    <tr key={`${trade.link}-${trade.ticker}-${trade.tx_date}-${index}`} className="border-t border-canvas">
                      <td className="px-3 py-2 font-mono text-[11px]">{formatDate(trade.tx_date)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-line">{formatDate(trade.disclosed)}</td>
                      <td className="px-3 py-2 text-center">
                        <TypeBadge type={trade.trade_type} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] font-bold">{trade.ticker ? `$${trade.ticker}` : "—"}</td>
                      <td className="max-w-56 px-3 py-2 text-[13px] text-ink-dim">
                        <span className="line-clamp-2">{trade.asset || "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px] whitespace-nowrap">{trade.amount || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] tracking-wider text-line uppercase">{trade.chamber || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {trade.link ? (
                          <a
                            href={trade.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded bg-canvas px-2 py-1 font-mono text-[10px] text-line transition-colors hover:bg-mint hover:text-[#00422b]"
                          >
                            PTR
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
      <div ref={boxRef} className="relative flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1" htmlFor={`${listId}-input`}>
            <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">
              Uma pessoa
            </span>
            <input
              id={`${listId}-input`}
              value={query}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Digite uma letra do nome"
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (person && value.trim() !== person) {
                  runPanelSwap(() => {
                    setPerson(null);
                    setTrades([]);
                    setTradeTotal(0);
                    setTradesError(null);
                    setChartHover(null);
                  });
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0 && query.trim() !== person) setOpen(true);
              }}
              onKeyDown={onQueryKey}
              className={INPUT}
            />
          </label>
        </div>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute top-full z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-panel-high py-1 shadow-lg"
          >
            {suggestError ? (
              <li className="px-3 py-2 text-[12px] text-danger">{suggestError}</li>
            ) : suggesting && visible.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-ink-dim">Buscando…</li>
            ) : visible.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-ink-dim">Nenhuma pessoa com esse trecho.</li>
            ) : (
              visible.map((member, index) => (
                <li key={member.name} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choosePerson(member.name)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
                      index === active ? "bg-panel text-mint" : "text-ink hover:bg-panel-high"
                    }`}
                  >
                    <span className="truncate text-[13px] font-semibold">{member.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-line uppercase">
                      {member.chambers.join(" · ")}
                    </span>
                  </button>
                </li>
              ))
            )}
            {suggestTotal > visible.length ? (
              <li className="px-3 py-1 font-mono text-[10px] text-line">
                {suggestTotal} nomes. Continue digitando.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="shrink-0 text-[14px] font-medium text-ink-dim">Pesquise por</span>
            <div className="relative min-w-0">
              <select
                id={`${listId}-metric`}
                aria-label="Ranking"
                value={metric}
                onChange={(event) => setMetric(event.target.value as ChartMetric)}
                className="h-9 max-w-full cursor-pointer appearance-none bg-panel pr-6 text-[18px] font-semibold tracking-tight text-ink outline-none [&>option]:bg-panel [&>option]:text-ink [&>option:checked]:bg-panel-high [&>option:checked]:text-mint"
              >
                <option value="count">Quem mais operou</option>
                <option value="notional">Dinheiro movimentado</option>
                <option value="buy">Compras</option>
                <option value="sell">Vendas</option>
              </select>
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-0 h-4 w-4 -translate-y-1/2 text-line"
                fill="currentColor"
              >
                <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="font-mono text-[10px] text-line">
            {leadersLoading ? "Lendo a base…" : `${metricSummary(total, shownMetric)} · ${period}`}
          </p>
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Período do ranking">
            {PERIOD_PRESETS.map((preset) => {
              const active = periodPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPeriodPreset(preset.id)}
                  className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
                    active
                      ? "bg-panel-high text-mint hover:brightness-110"
                      : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={applyDates}>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">De</span>
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPeriodPreset("custom");
              }}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">Até</span>
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPeriodPreset("custom");
              }}
              className={INPUT}
            />
          </label>
          <button
            type="submit"
            className="h-8 rounded-lg bg-mint px-3 text-[13px] font-semibold text-[#00422b] transition-colors hover:brightness-110"
          >
            Filtrar datas
          </button>
          <button
            type="button"
            onClick={clearDates}
            className="h-8 rounded-lg bg-canvas px-3 text-[13px] text-ink-dim transition-colors hover:bg-panel-high hover:text-ink"
          >
            Toda a base
          </button>
        </form>
      </div>

      {leadersError ? <p className="text-[12px] text-danger">{leadersError}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Donut
            slices={slices}
            total={total}
            loading={leadersLoading}
            active={chartHover}
            onHover={setChartHover}
            onPick={choosePerson}
          />
          <p className="text-center font-mono text-[10px] text-line">
            {metricRankLabel(shownMetric)}
            {shownMetric === "notional" ? " · ponto médio da faixa divulgada" : ""}
          </p>
        </div>
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
          {leaders.length === 0 && !leadersLoading ? (
            <li className="px-2 py-6 text-center text-[13px] text-ink-dim">Nenhuma operação nesse recorte.</li>
          ) : (
            leaders.map((leader, index) => {
              const selected = person === leader.name || chartHover === leader.name;
              return (
                <li key={leader.name}>
                  <button
                    type="button"
                    onClick={() => choosePerson(leader.name)}
                    onMouseEnter={() => setChartHover(leader.name)}
                    onMouseLeave={() => setChartHover(null)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      selected ? "bg-panel-high hover:brightness-110" : "bg-panel-low hover:bg-panel-high"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index] ?? COLORS[0] }} />
                    <span className="w-6 font-mono text-[11px] font-bold text-line">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{leader.name}</span>
                      <span className="font-mono text-[10px] tracking-wider text-line uppercase">
                        {leader.chambers.join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[12px] font-bold text-mint">
                        {formatMetricValue(leaderValue(leader), shownMetric)}
                      </span>
                      <span className="font-mono text-[10px] text-line">{percent(leaderValue(leader), total)} do total</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <p className="font-mono text-[10px] text-line">
        Escolha um nome no gráfico ou no autocomplete para listar todas as operações dessa pessoa.
      </p>
        </>
      )}
      </PanelSwap>
    </section>
  );
}

function Donut({
  slices,
  total,
  loading,
  active,
  onHover,
  onPick,
}: {
  slices: Slice[];
  total: number;
  loading: boolean;
  active: string | null;
  onHover: (name: string | null) => void;
  onPick: (name: string) => void;
}) {
  const chartTotal = slices.reduce((sum, slice) => sum + slice.count, 0);
  const arcs = pieArcs(slices);
  const hovered = arcs.find((arc) => arc.name === active) ?? null;
  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative h-56 w-56" aria-busy={loading}>
        <svg
          viewBox="0 0 100 100"
          className={`h-full w-full ${loading ? "pointer-events-none grayscale opacity-30" : ""}`}
          role="img"
          aria-label="Participação do ranking"
        >
          {arcs.length === 0 ? (
            <circle cx="50" cy="50" r="34" fill="none" className="stroke-panel-high" strokeWidth="28" />
          ) : null}
          <g onMouseLeave={() => onHover(null)}>
            {arcs.map((arc) => (
              <path
                key={arc.key}
                d={arc.d}
                data-slice={arc.name}
                fill={arc.color}
                fillRule="evenodd"
                opacity={!active || active === arc.name ? 1 : 0.38}
                className="cursor-pointer transition-[opacity,filter] hover:brightness-110"
                onMouseEnter={() => onHover(arc.name)}
                onClick={() => onPick(arc.name)}
              >
                <title>{arc.name}</title>
              </path>
            ))}
          </g>
        </svg>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="absolute inset-2 animate-pulse rounded-full border-[42px] border-[#86948a]/35" />
            <span
              className="relative h-8 w-8 animate-spin rounded-full border-2 border-[#c5c8d0] border-t-transparent"
              role="status"
              aria-label="Carregando"
            />
          </div>
        ) : null}
        {!loading && hovered ? (
          <div className="pointer-events-none absolute inset-[27%] z-10 flex flex-col items-center justify-center px-1 text-center">
            <p className="line-clamp-2 text-[12px] leading-tight font-semibold">{hovered.name}</p>
            <p className="font-mono text-[10px] font-bold text-mint">{percent(hovered.count, chartTotal)} do gráfico</p>
            <p className="font-mono text-[10px] text-line">{percent(hovered.count, total)} do total</p>
          </div>
        ) : null}
      </div>
      <p className="mt-2 min-h-4 text-center font-mono text-[10px] text-line">
        {loading || hovered ? "" : "Passe o mouse numa fatia"}
      </p>
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
  const label = normalized === "buy" ? "BUY" : normalized === "sell" ? "SELL" : normalized === "exchange" ? "EXCHANGE" : type || "—";
  return <span className={`inline-flex rounded px-2 py-0.5 font-mono text-[10px] font-bold ${tone}`}>{label}</span>;
}

function buildSlices(leaders: Leader[]): Slice[] {
  return leaders.map((leader, index) => ({
    key: leader.name,
    name: leader.name,
    count: leaderValue(leader),
    color: COLORS[index] ?? COLORS[COLORS.length - 1],
  }));
}

function leaderValue(leader: Leader): number {
  return leader.value ?? leader.count;
}

function formatMetricValue(value: number, metric: ChartMetric): string {
  if (metric === "notional") return formatUsd(value);
  return formatCount(value);
}

function metricSummary(total: number, metric: ChartMetric): string {
  if (metric === "notional") return `${formatUsd(total)} movimentados`;
  if (metric === "buy") return `${formatCount(total)} compras`;
  if (metric === "sell") return `${formatCount(total)} vendas`;
  return `${formatCount(total)} operações`;
}

function metricRankLabel(metric: ChartMetric): string {
  if (metric === "notional") return "20 pessoas que mais movimentaram";
  if (metric === "buy") return "20 pessoas com mais compras";
  if (metric === "sell") return "20 pessoas com mais vendas";
  return "20 pessoas com mais operações";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function pieArcs(slices: Slice[]): Array<Slice & { d: string }> {
  const chartTotal = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (chartTotal <= 0) return [];
  const outer = 48;
  const inner = 28;
  let angle = -Math.PI / 2;
  return slices
    .filter((slice) => slice.count > 0)
    .map((slice) => {
      const sweep = (slice.count / chartTotal) * Math.PI * 2;
      const start = angle;
      angle += sweep;
      const gap = sweep > 0.08 ? 0.015 : 0;
      return { ...slice, d: donutPath(start + gap, angle - gap, outer, inner) };
    });
}

function donutPath(start: number, end: number, outer: number, inner: number): string {
  const sweep = end - start;
  const point = (radius: number, theta: number) => {
    const x = 50 + Math.cos(theta) * radius;
    const y = 50 + Math.sin(theta) * radius;
    return `${x.toFixed(3)} ${y.toFixed(3)}`;
  };
  if (inner <= 0) {
    if (sweep >= Math.PI * 2 - 0.001) {
      return `M 50 ${50 - outer} A ${outer} ${outer} 0 1 1 50 ${50 + outer} A ${outer} ${outer} 0 1 1 50 ${50 - outer} Z`;
    }
    const large = sweep > Math.PI ? 1 : 0;
    return `M 50 50 L ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)} Z`;
  }
  if (sweep >= Math.PI * 2 - 0.001) {
    return `M 50 ${50 - outer} A ${outer} ${outer} 0 1 1 50 ${50 + outer} A ${outer} ${outer} 0 1 1 50 ${50 - outer} Z M 50 ${50 - inner} A ${inner} ${inner} 0 1 0 50 ${50 + inner} A ${inner} ${inner} 0 1 0 50 ${50 - inner} Z`;
  }
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
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
  return payload as T;
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function percent(count: number, total: number): string {
  if (total <= 0) return "0%";
  const value = (count / total) * 100;
  if (value > 0 && value < 0.1) return "<0,1%";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
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

function detectPeriodPreset(from: string, to: string): PeriodPreset {
  if (!from && !to) return "all";
  const today = isoLocalToday();
  if (to !== today) return "custom";
  for (const preset of PERIOD_PRESETS) {
    if (preset.days && from === isoLocalDaysAgo(preset.days)) return preset.id;
  }
  return "custom";
}
