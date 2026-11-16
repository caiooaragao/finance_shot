"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { ActivityRanks } from "./activity-ranks";
import { BiggestBuyer } from "./biggest-buyer";
import { OperationsBoard } from "./operations-board";

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

type Envelope = {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  trades: Trade[];
  data_current: boolean;
  cache_loading: boolean;
  last_updated: string | null;
  data_lag_minutes: number | null;
  next_refresh_in_minutes: number;
};

type Health = {
  data_current: boolean;
  cache_loading: boolean;
  last_updated: string | null;
  data_lag_minutes: number | null;
  next_refresh_in_minutes: number;
  filings: number;
  trades: number;
  senate_filings: number;
  senate_trades: number;
  house_filings: number;
  house_trades: number;
  last_error?: string | null;
  backfill_completed: boolean;
};

type Member = {
  name: string;
  chambers: string[];
};

type Filters = {
  q: string;
  member: string;
  asset: string;
  ticker: string;
  chamber: string;
  trade_type: string;
  amount: string;
  days: string;
  tx_date_from: string;
  tx_date_to: string;
  disclosed_from: string;
  disclosed_to: string;
  limit: string;
  offset: string;
};

type LedgerEndpoint = "trades" | "recent";

type LedgerRequest =
  | { kind: "trades"; endpoint: LedgerEndpoint; filters: Filters }
  | { kind: "ticker"; ticker: string; filters: Filters }
  | { kind: "member"; name: string; limit: number; offset: number };

const INITIAL_FILTERS: Filters = {
  q: "",
  member: "",
  asset: "",
  ticker: "",
  chamber: "",
  trade_type: "",
  amount: "",
  days: "",
  tx_date_from: "",
  tx_date_to: "",
  disclosed_from: "",
  disclosed_to: "",
  limit: "25",
  offset: "0",
};

const INPUT =
  "h-8 w-full rounded-lg border-0 bg-canvas px-2 font-mono text-[12px] text-ink outline-none placeholder:text-line focus:bg-panel-high";

export function CapitolDashboard() {
  const [clock, setClock] = useState("--:--:--");
  const [draft, setDraft] = useState<Filters>(INITIAL_FILTERS);
  const [endpoint, setEndpoint] = useState<LedgerEndpoint>("recent");
  const [request, setRequest] = useState<LedgerRequest>({
    kind: "trades",
    endpoint: "recent",
    filters: INITIAL_FILTERS,
  });
  const [rows, setRows] = useState<Trade[]>([]);
  const [meta, setMeta] = useState({ total: 0, offset: 0, limit: 25, has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState("Trades recentes");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [memberTotal, setMemberTotal] = useState<number | null>(null);
  const [memberNote, setMemberNote] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberLimit, setMemberLimit] = useState("25");
  const [memberOffset, setMemberOffset] = useState("0");

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getJson<Health>("/api/health", controller.signal)
      .then((body) => {
        if (!controller.signal.aborted) setHealth(body);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setHealthError(reason instanceof Error ? reason.message : "health indisponível");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const call = describe(request);
    setLoading(true);
    setError(null);
    setLastUrl(call.label);
    getJson<Envelope>(call.url, controller.signal, call.init)
      .then((body) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(body.trades)) throw new Error("resposta sem trades");
        setRows(body.trades);
        setMeta({
          total: body.total,
          offset: body.offset,
          limit: body.limit,
          has_more: body.has_more,
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbort(reason)) return;
        setRows([]);
        setError(reason instanceof Error ? reason.message : "falha ao carregar");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  const stats = useMemo(() => summarize(rows), [rows]);
  const pageStart = meta.total === 0 ? 0 : meta.offset + 1;
  const pageEnd = meta.offset + rows.length;

  function updateDraft<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function runLedger(next: Filters, nextEndpoint: LedgerEndpoint = endpoint) {
    const filters = { ...next, offset: "0" };
    setDraft(filters);
    setEndpoint(nextEndpoint);
    setRequest({ kind: "trades", endpoint: nextEndpoint, filters });
  }

  function runTicker() {
    const ticker = draft.ticker.trim();
    if (!ticker) {
      setError("Informe o ticker para consultar.");
      return;
    }
    const filters = { ...draft, offset: "0" };
    setDraft(filters);
    setRequest({ kind: "ticker", ticker, filters });
  }

  function turnPage(offset: number) {
    if (request.kind === "member") {
      setMemberOffset(String(offset));
      setRequest({ ...request, offset });
      return;
    }
    const filters = { ...request.filters, offset: String(offset) };
    setDraft(filters);
    setRequest({ ...request, filters });
  }

  async function searchMembers(event: FormEvent) {
    event.preventDefault();
    const q = memberQuery.trim();
    if (!q) {
      setMemberNote("Digite um trecho do nome para buscar.");
      return;
    }
    setMemberBusy(true);
    setMemberNote(null);
    try {
      const body = await getJson<{ total: number; names: Member[] }>("/api/members/search", undefined, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const total = body.total ?? 0;
      setMembers(body.names ?? []);
      setMemberTotal(total);
      setMemberNote(`${total} ${total === 1 ? "nome encontrado" : "nomes encontrados"}`);
    } catch (reason) {
      setMembers([]);
      setMemberTotal(null);
      setMemberNote(reason instanceof Error ? reason.message : "falha na busca");
    } finally {
      setMemberBusy(false);
    }
  }

  async function listMembers() {
    setMemberBusy(true);
    setMemberNote(null);
    try {
      const body = await getJson<{ total: number; names: Member[] }>("/api/members", undefined, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setMembers(body.names ?? []);
      setMemberTotal(body.total ?? 0);
      setMemberNote(`${body.total ?? 0} nomes na base`);
    } catch (reason) {
      setMembers([]);
      setMemberTotal(null);
      setMemberNote(reason instanceof Error ? reason.message : "falha ao listar");
    } finally {
      setMemberBusy(false);
    }
  }

  function runMemberTrades(event: FormEvent) {
    event.preventDefault();
    const name = memberName.trim();
    if (!name) {
      setError("Informe o nome do membro.");
      return;
    }
    const limit = clampInt(memberLimit, 25, 1, 500);
    const offset = clampInt(memberOffset, 0, 0, Number.MAX_SAFE_INTEGER);
    setMemberLimit(String(limit));
    setMemberOffset(String(offset));
    setRequest({ kind: "member", name, limit, offset });
  }

  function openMember(name: string) {
    setMemberName(name);
    setMemberOffset("0");
    const limit = clampInt(memberLimit, 25, 1, 500);
    setRequest({ kind: "member", name, limit, offset: 0 });
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 bg-panel-low px-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-1">
            <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">Wash D.C.</span>
            <span className="font-mono text-[12px] font-semibold text-ink">{clock}</span>
          </div>
          <div className="hidden items-center gap-4 font-mono text-[10px] xl:flex">
            <Tape label="SENADO" value={health ? String(health.senate_trades) : "—"} />
            <Tape label="CÂMARA" value={health ? String(health.house_trades) : "—"} />
            <Tape label="FILINGS" value={health ? String(health.filings) : "—"} accent />
          </div>
        </div>
        <form
          className="flex items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            runLedger(draft);
          }}
        >
          <label className="relative hidden">
            <span className="sr-only">Busca geral (q)</span>
            <SearchIcon />
            <input
              value={draft.q}
              onChange={(event) => updateDraft("q", event.target.value)}
              placeholder="Buscar membro, ticker, ativo (q)"
              className="h-8 w-72 rounded-lg bg-canvas pr-3 pl-9 font-sans text-[12px] text-ink outline-none placeholder:text-line focus:bg-panel-high"
            />
          </label>
          <div className="hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint font-mono text-[11px] font-bold text-canvas">
              FS
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold text-ink">Analyst terminal</span>
              <span className="font-mono text-[10px] tracking-wider text-line uppercase">Finance Shot</span>
            </span>
          </div>
        </form>
      </header>

      <main className="flex flex-col gap-4 px-4 pt-4 pb-8">
        <div className="grid w-full grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-6">
            <OperationsBoard />
          </div>
          <div className="grid min-h-0 grid-cols-1 gap-4 lg:col-span-6 lg:h-0 lg:min-h-full lg:grid-rows-[minmax(0,calc((100%-1rem)/2+2.5rem))_minmax(0,calc((100%-1rem)/2-2.5rem))]">
            <ActivityRanks />
            <BiggestBuyer />
          </div>
        </div>
        <section className="order-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Operações na consulta"
            badge={meta.has_more ? "há mais páginas" : "página atual"}
            value={loading && rows.length === 0 ? "…" : formatCount(meta.total)}
            detail={
              stats.notional === null
                ? `${health?.trades ?? "—"} trades no banco`
                : `${formatUsd(stats.notional)} estimados nesta página`
            }
          />
          <Kpi
            label="Viés compra / venda"
            badge={stats.buyRatio === null ? "sem amostra" : stats.buyRatio >= 50 ? "viés de compra" : "viés de venda"}
            value={stats.buyRatio === null ? "—" : `${stats.buyRatio}%`}
            detail={
              stats.buyRatio === null
                ? "BUY vs SELL nesta página"
                : `${stats.buys} compras · ${stats.sells} vendas`
            }
            meter={stats.buyRatio}
          />
          <Kpi
            label="Ativo mais operado"
            badge="nesta página"
            value={stats.top ? `$${stats.top.ticker}` : "—"}
            detail={
              stats.top
                ? `${stats.top.count} operações · ${stats.top.buyPct}% compra`
                : "Preencha os filtros e consulte"
            }
          />
          <Kpi
            label="Frescor dos dados"
            badge={health?.cache_loading ? "cache carregando" : health?.data_current ? "atual" : "aguardando"}
            value={
              health?.data_lag_minutes === null || health?.data_lag_minutes === undefined
                ? "—"
                : `${health.data_lag_minutes} min`
            }
            detail={
              health
                ? `próximo refresh em ${health.next_refresh_in_minutes} min`
                : (healthError ?? "Status indisponível")
            }
            valueClass={health?.data_current ? "text-mint" : undefined}
          />
        </section>

          <div className="order-1 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="flex flex-col gap-3 lg:col-span-8">
              {/* <form
                className="order-2 flex flex-col gap-3 rounded-xl bg-panel p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  runLedger(draft);
                }}
              > */}
                {/* <h2 className="text-[14px] font-semibold tracking-tight">Filtros</h2>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="q" className="sm:hidden">
                    <input
                      value={draft.q}
                      onChange={(event) => updateDraft("q", event.target.value)}
                      placeholder="busca geral"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="member">
                    <input
                      value={draft.member}
                      onChange={(event) => updateDraft("member", event.target.value)}
                      placeholder="Pelosi"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="asset">
                    <input
                      value={draft.asset}
                      onChange={(event) => updateDraft("asset", event.target.value)}
                      placeholder="NVIDIA"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="ticker">
                    <input
                      value={draft.ticker}
                      onChange={(event) => updateDraft("ticker", event.target.value)}
                      placeholder="NVDA"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="fonte">
                    <select
                      value={endpoint}
                      onChange={(event) => setEndpoint(event.target.value === "recent" ? "recent" : "trades")}
                      className={INPUT}
                    >
                      <option value="trades">Ledger completo</option>
                      <option value="recent">Trades recentes</option>
                    </select>
                  </Field>
                  <Field label="chamber">
                    <select
                      value={draft.chamber}
                      onChange={(event) => updateDraft("chamber", event.target.value)}
                      className={INPUT}
                    >
                      <option value="">todas</option>
                      <option value="senate">senate</option>
                      <option value="house">house</option>
                    </select>
                  </Field>
                  <Field label="trade_type">
                    <select
                      value={draft.trade_type}
                      onChange={(event) => updateDraft("trade_type", event.target.value)}
                      className={INPUT}
                    >
                      <option value="">todos</option>
                      <option value="buy">buy</option>
                      <option value="sell">sell</option>
                      <option value="exchange">exchange</option>
                    </select>
                  </Field>
                  <Field label="amount">
                    <input
                      value={draft.amount}
                      onChange={(event) => updateDraft("amount", event.target.value)}
                      placeholder="$15,000"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="days">
                    <input
                      value={draft.days}
                      onChange={(event) => updateDraft("days", event.target.value)}
                      inputMode="numeric"
                      placeholder="30"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="tx_date_from">
                    <input
                      type="date"
                      value={draft.tx_date_from}
                      onChange={(event) => updateDraft("tx_date_from", event.target.value)}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="tx_date_to">
                    <input
                      type="date"
                      value={draft.tx_date_to}
                      onChange={(event) => updateDraft("tx_date_to", event.target.value)}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="disclosed_from">
                    <input
                      type="date"
                      value={draft.disclosed_from}
                      onChange={(event) => updateDraft("disclosed_from", event.target.value)}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="disclosed_to">
                    <input
                      type="date"
                      value={draft.disclosed_to}
                      onChange={(event) => updateDraft("disclosed_to", event.target.value)}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="limit">
                    <input
                      value={draft.limit}
                      onChange={(event) => updateDraft("limit", event.target.value)}
                      inputMode="numeric"
                      placeholder="25"
                      className={INPUT}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-mint px-3 py-1.5 text-[13px] font-semibold text-[#00422b] transition-colors hover:brightness-110"
                  >
                    Consultar ledger
                  </button>
                  <button
                    type="button"
                    onClick={runTicker}
                    className="rounded-lg bg-panel-high px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-mint uppercase transition-colors hover:bg-panel hover:text-mint-deep"
                  >
                    Consultar por ticker
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(INITIAL_FILTERS);
                      setEndpoint("recent");
                      setRequest({ kind: "trades", endpoint: "recent", filters: INITIAL_FILTERS });
                    }}
                    className="rounded-lg bg-canvas px-3 py-1.5 text-[13px] text-ink-dim transition-colors hover:bg-panel-high hover:text-ink"
                  >
                    Limpar
                  </button>
                </div>
              </form> */}

              <div className="order-1 overflow-hidden rounded-xl bg-panel">
                <div className="flex flex-col gap-3 border-b border-canvas px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mint" />
                    <h1 className="text-[18px] font-semibold tracking-tight">Trades recentes</h1>
                    <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-line">{lastUrl}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill active={draft.chamber === "" && draft.trade_type === ""} onClick={() => runLedger({ ...draft, chamber: "", trade_type: "" }, "recent")}>
                      Recentes
                    </Pill>
                    <Pill active={draft.chamber === "senate"} onClick={() => runLedger({ ...draft, chamber: "senate" }, "recent")}>
                      Senado
                    </Pill>
                    <Pill active={draft.chamber === "house"} onClick={() => runLedger({ ...draft, chamber: "house" }, "recent")}>
                      Câmara
                    </Pill>
                    <Pill
                      active={draft.trade_type === "buy"}
                      onClick={() => runLedger({ ...draft, trade_type: draft.trade_type === "buy" ? "" : "buy" }, "recent")}
                    >
                      Compra
                    </Pill>
                    <Pill
                      active={draft.trade_type === "sell"}
                      onClick={() => runLedger({ ...draft, trade_type: draft.trade_type === "sell" ? "" : "sell" }, "recent")}
                    >
                      Venda
                    </Pill>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left">
                    <thead className="bg-panel-low font-mono text-[10px] tracking-wider text-line uppercase">
                      <tr>
                        <th className="px-3 py-2 font-bold">Político e câmara</th>
                        <th className="px-3 py-2 font-bold">Ativo</th>
                        <th className="px-3 py-2 text-center font-bold">Tipo</th>
                        <th className="px-3 py-2 font-bold">Ticker</th>
                        <th className="px-3 py-2 text-right font-bold">Valor divulgado</th>
                        <th className="px-3 py-2 font-bold">Linha do tempo</th>
                        <th className="px-3 py-2 text-center font-bold">PTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-ink-dim">
                            {loading ? "Carregando…" : (error ?? "Nenhum trade para esses campos.")}
                          </td>
                        </tr>
                      ) : (
                        rows.map((trade, index) => (
                          <TradeRow key={`${trade.link}-${trade.ticker}-${trade.tx_date}-${index}`} trade={trade} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-2 bg-panel-low px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-[10px] text-line">
                    {meta.total === 0
                      ? "0 TRANSAÇÕES"
                      : `MOSTRANDO ${pageStart}–${pageEnd} DE ${meta.total}`}
                    <span className="ml-3 text-ink-dim">{lastUrl}</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={meta.offset <= 0 || loading}
                      onClick={() => turnPage(Math.max(0, meta.offset - meta.limit))}
                      className="rounded bg-canvas px-2 py-1 font-mono text-[10px] tracking-wider text-line uppercase transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-40 disabled:hover:bg-canvas disabled:hover:text-line"
                    >
                      Prev
                    </button>
                    <span className="rounded bg-panel-high px-2 py-1 font-mono text-[11px] font-bold text-mint">
                      {meta.limit === 0 ? 1 : Math.floor(meta.offset / meta.limit) + 1}
                    </span>
                    <button
                      type="button"
                      disabled={!meta.has_more || loading}
                      onClick={() => turnPage(meta.offset + meta.limit)}
                      className="rounded bg-canvas px-2 py-1 font-mono text-[10px] tracking-wider text-line uppercase transition-colors hover:bg-panel-high hover:text-ink disabled:opacity-40 disabled:hover:bg-canvas disabled:hover:text-line"
                    >
                      Next
                    </button>
                  </div>
                </div>
                {error && rows.length > 0 ? (
                  <p className="px-3 py-2 text-[12px] text-danger">{error}</p>
                ) : null}
              </div>

              <div className="order-3">
                <MonthMix rows={stats.months} />
              </div>
            </section>

          </div>
      </main>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const delta = dayDelta(trade.tx_date, trade.disclosed);
  const senate = trade.chamber.toLowerCase().includes("senate");
  return (
    <tr className="border-t border-canvas hover:bg-panel-high/70">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas font-mono text-[10px] font-bold text-mint">
            {initials(trade.member)}
          </span>
          <span>
            <span className="block text-[13px] font-semibold">{trade.member || "—"}</span>
            <span className="font-mono text-[10px] tracking-wider text-line uppercase">
              <span className={senate ? "text-sky" : "text-amber"}>{senate ? "SENATE" : "HOUSE"}</span>
              {trade.chamber && !senate && !trade.chamber.toLowerCase().includes("house")
                ? ` · ${trade.chamber}`
                : ""}
            </span>
          </span>
        </div>
      </td>
      <td className="max-w-48 px-3 py-2">
        <span className="line-clamp-2 text-[13px] text-ink-dim">{trade.asset || "—"}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <TypeBadge type={trade.trade_type} />
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-[12px] font-bold">{trade.ticker ? `$${trade.ticker}` : "—"}</span>
      </td>
      <td className="px-3 py-2 text-right font-mono text-[12px] whitespace-nowrap">{trade.amount || "—"}</td>
      <td className="px-3 py-2">
        <span className="block font-mono text-[11px] text-ink">Op.: {formatDate(trade.tx_date)}</span>
        <span className="font-mono text-[10px] text-line">
          Divulg.: {formatDate(trade.disclosed)}
          {delta === null ? "" : ` · T+${delta}`}
        </span>
      </td>
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
  );
}

function MonthMix({ rows }: { rows: MonthBucket[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.buy + row.sell + row.other), 1);
  return (
    <section className="rounded-xl bg-panel p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">Compras e vendas por mês</h2>
        <p className="font-mono text-[10px] text-line">nesta página do ledger</p>
      </div>
      <div className="flex h-36 items-end gap-2">
        {rows.map((row) => {
          const total = row.buy + row.sell + row.other;
          return (
            <div key={row.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
              <div className="flex h-full items-end overflow-hidden rounded bg-canvas">
                <div className="flex w-full flex-col-reverse" style={{ height: `${(total / max) * 100}%` }}>
                  <div className="bg-mint" style={{ height: `${(row.buy / total) * 100}%` }} />
                  <div className="bg-danger" style={{ height: `${(row.sell / total) * 100}%` }} />
                  <div className="bg-amber" style={{ height: `${(row.other / total) * 100}%` }} />
                </div>
              </div>
              <span className="truncate text-center font-mono text-[10px] text-line">{row.label.slice(2)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TickerBars({ tickers }: { tickers: TickerStat[] }) {
  const max = tickers[0]?.count ?? 1;
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-panel p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Tickers da consulta</h2>
        <span className="font-mono text-[10px] text-line">CONTAGEM</span>
      </div>
      {tickers.length === 0 ? (
        <p className="text-[12px] text-ink-dim">Sem tickers nesta página.</p>
      ) : (
        tickers.map((ticker) => (
          <div key={ticker.ticker} className="flex flex-col gap-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-bold text-mint">${ticker.ticker}</span>
              <span className={ticker.buyPct >= 50 ? "text-mint" : "text-danger"}>
                {ticker.count} · {ticker.buyPct}% buy
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-canvas">
              <div className="h-full bg-mint" style={{ width: `${(ticker.count / max) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Leaderboard({ leaders }: { leaders: LeaderStat[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-panel p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Quem mais operou</h2>
        <span className="font-mono text-[10px] font-bold text-mint">NESTA PÁGINA</span>
      </div>
      {leaders.length === 0 ? (
        <p className="text-[12px] text-ink-dim">A consulta ainda não trouxe membros.</p>
      ) : (
        leaders.map((leader, index) => (
          <div key={leader.name} className="flex items-center justify-between gap-2 rounded-lg bg-panel-low px-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`font-mono text-[12px] font-bold ${index === 0 ? "text-amber" : "text-line"}`}>
                #{String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{leader.name}</span>
                <span className="font-mono text-[10px] text-line">{leader.count} trades</span>
              </span>
            </div>
            <span className="font-mono text-[12px] font-bold text-mint">{leader.buyPct}% buy</span>
          </div>
        ))
      )}
    </section>
  );
}

function Kpi({
  label,
  badge,
  value,
  detail,
  meter,
  valueClass,
}: {
  label: string;
  badge: string;
  value: string;
  detail: string;
  meter?: number | null;
  valueClass?: string;
}) {
  return (
    <article className="flex flex-col justify-between gap-3 rounded-xl bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">{label}</span>
        <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-bold text-mint">{badge}</span>
      </div>
      <div>
        <p className={`text-[28px] leading-none font-bold tracking-tight ${valueClass ?? "text-ink"}`}>{value}</p>
        <p className="mt-1 font-mono text-[10px] text-ink-dim">{detail}</p>
        {typeof meter === "number" ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-canvas">
            <div className="h-full bg-mint" style={{ width: `${meter}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="font-mono text-[10px] font-bold tracking-wider text-line uppercase">{label}</span>
      {children}
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 font-mono text-[10px] font-bold tracking-wider uppercase transition-colors ${
        active
          ? "bg-panel-high text-mint hover:brightness-110"
          : "bg-canvas text-ink-dim hover:bg-panel-high hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Tape({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-bold text-line">{label}</span>
      <span className={accent ? "font-bold text-mint" : "text-ink"}>{value}</span>
    </span>
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

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-line"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

type MonthBucket = { label: string; buy: number; sell: number; other: number };
type TickerStat = { ticker: string; count: number; buyPct: number };
type LeaderStat = { name: string; count: number; buyPct: number };

function summarize(rows: Trade[]) {
  let buys = 0;
  let sells = 0;
  let notional = 0;
  let priced = 0;
  const tickers = new Map<string, { count: number; buys: number }>();
  const leaders = new Map<string, { count: number; buys: number }>();
  const months = new Map<string, MonthBucket>();

  for (const trade of rows) {
    const kind = trade.trade_type.toLowerCase();
    if (kind === "buy") buys += 1;
    if (kind === "sell") sells += 1;
    const mid = amountMidpoint(trade.amount);
    if (mid !== null) {
      notional += mid;
      priced += 1;
    }
    const ticker = trade.ticker.trim();
    if (ticker) {
      const row = tickers.get(ticker) ?? { count: 0, buys: 0 };
      row.count += 1;
      if (kind === "buy") row.buys += 1;
      tickers.set(ticker, row);
    }
    const name = trade.member.trim();
    if (name) {
      const row = leaders.get(name) ?? { count: 0, buys: 0 };
      row.count += 1;
      if (kind === "buy") row.buys += 1;
      leaders.set(name, row);
    }
    const month = (trade.tx_date ?? trade.disclosed).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      const row = months.get(month) ?? { label: month, buy: 0, sell: 0, other: 0 };
      if (kind === "buy") row.buy += 1;
      else if (kind === "sell") row.sell += 1;
      else row.other += 1;
      months.set(month, row);
    }
  }

  const denom = buys + sells;
  const tickerList = [...tickers.entries()]
    .map(([ticker, row]) => ({
      ticker,
      count: row.count,
      buyPct: row.count === 0 ? 0 : Math.round((row.buys / row.count) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const leaderList = [...leaders.entries()]
    .map(([name, row]) => ({
      name,
      count: row.count,
      buyPct: row.count === 0 ? 0 : Math.round((row.buys / row.count) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    buys,
    sells,
    buyRatio: denom === 0 ? null : Math.round((buys / denom) * 100),
    notional: priced === 0 ? null : notional,
    top: tickerList[0] ?? null,
    tickers: tickerList,
    leaders: leaderList,
    months: [...months.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(-8),
  };
}

function describe(request: LedgerRequest): { url: string; label: string; init?: RequestInit } {
  if (request.kind === "member") {
    return {
      url: "/api/members/trades",
      label: `Trades · ${request.name}`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: request.name, limit: request.limit, offset: request.offset }),
      },
    };
  }
  const params = toParams(request.filters, request.kind === "ticker");
  const query = params.size ? `?${params}` : "";
  if (request.kind === "ticker") {
    const path = `/api/trades/${encodeURIComponent(request.ticker)}`;
    return { url: `${path}${query}`, label: `Ticker · ${request.ticker.toUpperCase()}` };
  }
  const path = request.endpoint === "recent" ? "/api/trades/recent" : "/api/trades";
  const label = request.endpoint === "recent" ? "Trades recentes" : "Ledger";
  return { url: `${path}${query}`, label };
}

function toParams(filters: Filters, omitTicker: boolean): URLSearchParams {
  const params = new URLSearchParams();
  const entries: [string, string][] = [
    ["q", filters.q],
    ["member", filters.member],
    ["asset", filters.asset],
    ["ticker", omitTicker ? "" : filters.ticker],
    ["chamber", filters.chamber],
    ["trade_type", filters.trade_type],
    ["amount", filters.amount],
    ["days", filters.days],
    ["tx_date_from", filters.tx_date_from],
    ["tx_date_to", filters.tx_date_to],
    ["disclosed_from", filters.disclosed_from],
    ["disclosed_to", filters.disclosed_to],
    ["limit", filters.limit],
    ["offset", filters.offset === "0" ? "" : filters.offset],
  ];
  for (const [key, value] of entries) {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  }
  return params;
}

async function getJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function clampInt(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function amountMidpoint(amount: string): number | null {
  const matches = amount.replace(/[$,]/g, "").match(/\d+(?:\.\d+)?/g);
  if (!matches) return null;
  const values = matches.map(Number).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  return (values[0] + values[values.length - 1]) / 2;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
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

function dayDelta(tx: string | null, disclosed: string): number | null {
  if (!tx) return null;
  const start = Date.parse(tx);
  const end = Date.parse(disclosed);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
