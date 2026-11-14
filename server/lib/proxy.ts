const PROXY_ENV_KEYS = [
  "OUTBOUND_PROXY_URL",
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
] as const;

/** URL do proxy de saída (ex.: `http://user:pass@us-proxy.example.com:8080`). */
export function getOutboundProxyUrl(): string | undefined {
  for (const key of PROXY_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function isOutboundProxyEnabled(): boolean {
  return Boolean(getOutboundProxyUrl());
}
