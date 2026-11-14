/** Estado mutável do processo, compartilhado entre os bundles do Next.js. */

export function processSlot<T>(key: string, initial: T): { value: T } {
  const bag = globalThis as unknown as Record<string, { value: T } | undefined>;
  const existing = bag[key];
  if (existing) return existing;
  const created = { value: initial };
  bag[key] = created;
  return created;
}
