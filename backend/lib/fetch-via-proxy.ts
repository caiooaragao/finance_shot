import {
  fetch as undiciFetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from "undici";

import { getOutboundProxyUrl } from "./proxy";

let cachedDispatcher: Dispatcher | undefined;

function getProxyDispatcher(): Dispatcher | undefined {
  const proxyUrl = getOutboundProxyUrl();
  if (!proxyUrl) return undefined;

  if (!cachedDispatcher) {
    cachedDispatcher = new ProxyAgent(proxyUrl);
  }
  return cachedDispatcher;
}

/**
 * `fetch` que encaminha requisições de saída pelo proxy (ex.: datacenter/residencial nos EUA).
 * Sem `OUTBOUND_PROXY_URL` / `HTTPS_PROXY`, usa o `fetch` nativo do Node.
 */
export async function fetchViaProxy(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const dispatcher = getProxyDispatcher();
  if (!dispatcher) {
    return fetch(input, init);
  }

  const undiciInit: UndiciRequestInit = {
    ...(init as UndiciRequestInit),
    dispatcher,
  };

  return undiciFetch(input, undiciInit) as unknown as Response;
}
