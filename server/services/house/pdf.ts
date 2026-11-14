import { extractText, getDocumentProxy } from "unpdf";

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadHousePdf(url: string): Promise<Uint8Array | null> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await pause(400 * attempt);
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      lastError = new Error(`PDF da Câmara respondeu HTTP ${response.status}`);
      continue;
    }
    if (!response.ok) throw new Error(`PDF da Câmara respondeu HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      lastError = new Error("PDF da Câmara veio vazio");
      continue;
    }
    return bytes;
  }
  throw lastError ?? new Error("PDF da Câmara falhou");
}

export async function housePdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  return text.replace(/\u0000/g, " ");
}
