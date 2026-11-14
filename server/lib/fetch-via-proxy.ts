import {
  fetch as undiciFetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from "undici";

import { processSlot } from "./singleton";
import { getOutboundProxyUrl } from "./proxy";

const cachedDispatcher = processSlot<Dispatcher | undefined>("finance-shot.proxy", undefined);

function getProxyDispatcher(): Dispatcher | undefined {
  const proxyUrl = getOutboundProxyUrl();
  if (!proxyUrl) return undefined;

  if (!cachedDispatcher.value) {
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
