import { processSlot } from "./singleton";
import { getOutboundProxyUrl } from "./proxy";

type UndiciDispatcher = import("undici").Dispatcher;
type UndiciRequestInit = import("undici").RequestInit;

const cachedDispatcher = processSlot<UndiciDispatcher | undefined>("finance-shot.proxy", undefined);

async function getProxyDispatcher(): Promise<UndiciDispatcher | undefined> {
  const proxyUrl = getOutboundProxyUrl();
  if (!proxyUrl) return undefined;

  if (!cachedDispatcher.value) {
    const { ProxyAgent } = await import("undici");
    cachedDispatcher.value = new ProxyAgent(proxyUrl);
  }
  return cachedDispatcher.value;
}

/**
 * `fetch` que encaminha requisições de saída pelo proxy (ex.: datacenter/residencial nos EUA).
 * Sem `OUTBOUND_PROXY_URL` / `HTTPS_PROXY`, usa o `fetch` nativo do Node.
 */
export async function fetchViaProxy(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const dispatcher = await getProxyDispatcher();
  if (!dispatcher) {
    return fetch(input, init);
  }

  const { fetch: undiciFetch } = await import("undici");
  const undiciInit: UndiciRequestInit = {
    ...(init as UndiciRequestInit),
    dispatcher,
  };

  return undiciFetch(input, undiciInit) as unknown as Response;
}
