const TRADE_TYPES = [
  { value: "", label: "Todos os tipos" },
  { value: "buy", label: "Compra" },
  { value: "sell", label: "Venda" },
  { value: "exchange", label: "Troca" },
];

export type TradeFilters = {
  q: string;
  member: string;
  asset: string;
  ticker: string;
  chamber: string;
  trade_type: string;
  amount: string;
  tx_date_from: string;
  tx_date_to: string;
  disclosed_from: string;
  disclosed_to: string;
};

export function emptyTradeFilters(): TradeFilters {
  return {
    q: "",
    member: "",
    asset: "",
    ticker: "",
    chamber: "",
    trade_type: "",
    amount: "",
    tx_date_from: "",
    tx_date_to: "",
    disclosed_from: "",
    disclosed_to: "",
  };
}

export function filtersFromSearch(search: URLSearchParams): TradeFilters {
  const defaults = emptyTradeFilters();
  return {
    q: search.get("q") ?? defaults.q,
    member: search.get("member") ?? defaults.member,
    asset: search.get("asset") ?? search.get("company") ?? defaults.asset,
    ticker: search.get("ticker") ?? defaults.ticker,
    chamber: search.get("chamber") ?? defaults.chamber,
    trade_type: search.get("trade_type") ?? search.get("type") ?? defaults.trade_type,
    amount: search.get("amount") ?? defaults.amount,
    tx_date_from: search.get("tx_date_from") ?? search.get("date_from") ?? defaults.tx_date_from,
    tx_date_to: search.get("tx_date_to") ?? search.get("date_to") ?? defaults.tx_date_to,
    disclosed_from: search.get("disclosed_from") ?? defaults.disclosed_from,
    disclosed_to: search.get("disclosed_to") ?? defaults.disclosed_to,
  };
}

export function TradesFilters({ filters, total }: { filters: TradeFilters; total: number | null }) {
  return (
    <form method="get" className="flex flex-col gap-3 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-black dark:text-zinc-50">Filtros</h3>
          <p className="text-xs text-zinc-500">Nome, empresa, datas e demais campos da tabela.</p>
        </div>
        {total !== null ? <p className="text-xs text-zinc-500">{total} resultado{total === 1 ? "" : "s"}</p> : null}
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Busca geral
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Nome, ticker, empresa, tipo…"
          className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="member" label="Nome do membro" defaultValue={filters.member} placeholder="Jane Doe" />
        <Field name="asset" label="Empresa / ativo" defaultValue={filters.asset} placeholder="NVIDIA" />
        <Field name="ticker" label="Ticker" defaultValue={filters.ticker} placeholder="NVDA" />
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Câmara
          <select
            name="chamber"
            defaultValue={filters.chamber}
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
          >
            <option value="">Todas</option>
            <option value="senate">Senado</option>
            <option value="house">Câmara</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Tipo
          <select
            name="trade_type"
            defaultValue={filters.trade_type}
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
          >
            {TRADE_TYPES.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Field name="amount" label="Valor" defaultValue={filters.amount} placeholder="$1,001" />
        <Field name="tx_date_from" label="Operação de" defaultValue={filters.tx_date_from} type="date" />
        <Field name="tx_date_to" label="Operação até" defaultValue={filters.tx_date_to} type="date" />
        <Field name="disclosed_from" label="Divulgado de" defaultValue={filters.disclosed_from} type="date" />
        <Field name="disclosed_to" label="Divulgado até" defaultValue={filters.disclosed_to} type="date" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-black px-3 py-2 text-sm text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          Filtrar
        </button>
        <a
          href="/"
          className="rounded-lg border border-black/[.08] px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-300 dark:hover:bg-white/[.08]"
        >
          Limpar
        </a>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
      />
    </label>
  );
}
