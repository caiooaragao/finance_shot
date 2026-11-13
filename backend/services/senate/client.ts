import { formatMdy, toIsoDate } from "../../lib/dates";
import { fetchViaProxy } from "../../lib/fetch-via-proxy";

const BASE = "https://efdsearch.senate.gov";
const SEARCH_PAGE = `${BASE}/search/`;
const AGREE_URL = `${BASE}/search/home/`;
const REPORT_DATA = `${BASE}/search/report/data/`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SESSION_TTL_MS = 25 * 60 * 1000;

export class SenateBlockedError extends Error {
  readonly status = 403;

  constructor(message = "O eFD do Senado respondeu 403. Use um proxy residencial nos EUA.") {
    super(message);
    this.name = "SenateBlockedError";
  }
}

export class SenateShapeError extends Error {
  constructor(message = "A resposta do índice de PTRs não tem o formato esperado.") {
    super(message);
    this.name = "SenateShapeError";
  }
}

export type FilingRef = {
  id: string | null;
  paper: boolean;
  member: string;
  disclosed: string | null;
  link: string;
};

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(setCookies: string[]): void {
    for (const raw of setCookies) {
      const pair = raw.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

export function readSetCookie(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === "function") {
    const values = extended.getSetCookie();
    if (values.length > 0) return values;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export function parseSearchRow(row: unknown[]): FilingRef | null {
  if (row.length < 5) return null;
  const first = String(row[0] ?? "").trim();
  const last = String(row[1] ?? "").trim();
  const html = String(row[3] ?? "");
  const href = html.match(/href="([^"]+)"/)?.[1];
  if (!href) return null;
  const link = new URL(href, BASE).toString();
  const uuid = link.match(/\/ptr\/([0-9a-f-]{36})\//i)?.[1]?.toLowerCase() ?? null;
  return {
    id: uuid,
    paper: link.includes("/paper/"),
    member: `${first} ${last}`.trim(),
    disclosed: toIsoDate(String(row[4] ?? "")),
    link,
  };
}

type SearchResponse = {
  result?: string;
  recordsTotal?: number | string;
  data?: unknown;
};

export class SenateClient {
  private readonly jar = new CookieJar();
  private csrf = "";
  private authenticatedAt = 0;

  async filings(start: Date, end: Date): Promise<FilingRef[]> {
    const rows: FilingRef[] = [];
    for (const reportTypes of ["[11]", "[14]"]) {
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (offset < total && offset < 100_000) {
        const page = await this.searchPage({ reportTypes, start, end, offset, length: 100 });
        total = page.total;
        if (page.rows.length === 0) break;
        rows.push(...page.rows);
        offset += page.rows.length;
      }
    }
    return rows;
  }

  async searchPage(input: {
    reportTypes?: string;
    start: Date;
    end: Date;
    offset?: number;
    length?: number;
  }): Promise<{ total: number; rows: FilingRef[] }> {
    await this.ensureSession();
    const body = searchBody({
      reportTypes: input.reportTypes ?? "[11]",
      start: input.start,
      end: input.end,
      offset: input.offset ?? 0,
      length: input.length ?? 100,
      csrf: this.csrf,
    });
    const response = await this.request(REPORT_DATA, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: SEARCH_PAGE,
        origin: BASE,
        "x-csrftoken": this.jar.get("csrftoken") ?? this.csrf,
        "x-requested-with": "XMLHttpRequest",
      },
      body: body.toString(),
    });
    const text = await response.text();
    if (response.status === 403 || /access denied/i.test(text)) {
      throw new SenateBlockedError();
    }
    let payload: SearchResponse;
    try {
      payload = JSON.parse(text) as SearchResponse;
    } catch {
      throw new SenateShapeError("O índice de PTRs não devolveu JSON.");
    }
    if (payload.result && payload.result !== "ok") {
      throw new SenateShapeError(`O eFD devolveu result=${payload.result}.`);
    }
    if (!Array.isArray(payload.data)) throw new SenateShapeError();
    const rows = payload.data
      .map((row) => (Array.isArray(row) ? parseSearchRow(row) : null))
      .filter((row): row is FilingRef => row !== null);
    return { total: Number(payload.recordsTotal ?? rows.length) || 0, rows };
  }

  async fetchReport(url: string): Promise<string> {
    await this.ensureSession();
    const response = await this.request(url, { method: "GET", headers: { referer: SEARCH_PAGE } });
    const text = await response.text();
    if (response.status === 403 || /access denied/i.test(text)) throw new SenateBlockedError();
    if (!/transaction date/i.test(text) && /prohibition_agreement/i.test(text)) {
      this.authenticatedAt = 0;
      await this.ensureSession();
      const retry = await this.request(url, { method: "GET", headers: { referer: SEARCH_PAGE } });
      const retried = await retry.text();
      if (retry.status === 403) throw new SenateBlockedError();
      return retried;
    }
    return text;
  }

  private async ensureSession(): Promise<void> {
    if (this.csrf && Date.now() - this.authenticatedAt < SESSION_TTL_MS) return;
    const home = await this.request(SEARCH_PAGE, { method: "GET" });
    const html = await home.text();
    if (home.status === 403 || /access denied/i.test(html)) throw new SenateBlockedError();
    const token = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1]
      ?? html.match(/value="([^"]+)"\s+name="csrfmiddlewaretoken"/)?.[1];
    if (!token) throw new SenateShapeError("csrfmiddlewaretoken não encontrado.");
    const agreed = await this.request(AGREE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: SEARCH_PAGE,
        origin: BASE,
      },
      body: new URLSearchParams({
        prohibition_agreement: "1",
        csrfmiddlewaretoken: token,
      }).toString(),
    });
    if (agreed.status === 403) throw new SenateBlockedError();
    await agreed.arrayBuffer();
    this.csrf = this.jar.get("csrftoken") ?? token;
    this.authenticatedAt = Date.now();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let current = url;
    let method = init.method ?? "GET";
    let body = init.body;
    for (let hop = 0; hop < 6; hop += 1) {
      const headers = new Headers(init.headers);
      headers.set("user-agent", USER_AGENT);
      headers.set("accept", "text/html,application/json;q=0.9,*/*;q=0.8");
      const cookie = this.jar.header();
      if (cookie) headers.set("cookie", cookie);
      const response = await fetchViaProxy(current, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : body,
        redirect: "manual",
      });
      this.jar.absorb(readSetCookie(response.headers));
      if (response.status === 403) return response;
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.arrayBuffer().catch(() => undefined);
        current = new URL(location, current).toString();
        method = "GET";
        body = undefined;
        continue;
      }
      return response;
    }
    throw new Error("muitos redirecionamentos no eFD");
  }
}

function searchBody(input: {
  reportTypes: string;
  start: Date;
  end: Date;
  offset: number;
  length: number;
  csrf: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    start: String(input.offset),
    length: String(input.length),
    report_types: input.reportTypes,
    filer_types: "[1]",
    submitted_start_date: formatMdy(input.start),
    submitted_end_date: formatMdy(input.end),
    candidate_state: "",
    senator_state: "",
    office_id: "",
    first_name: "",
    last_name: "",
    draw: "1",
    "order[0][column]": "4",
    "order[0][dir]": "desc",
    "search[value]": "",
    "search[regex]": "false",
    csrfmiddlewaretoken: input.csrf,
  });
  for (let index = 0; index < 5; index += 1) {
    params.set(`columns[${index}][data]`, String(index));
    params.set(`columns[${index}][name]`, "");
    params.set(`columns[${index}][searchable]`, "true");
    params.set(`columns[${index}][orderable]`, "true");
    params.set(`columns[${index}][search][value]`, "");
    params.set(`columns[${index}][search][regex]`, "false");
  }
  return params;
}
