export function normalizeParallelModels(
  baseModelId: string | undefined,
  list?: string[],
): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (baseModelId && trimmed === baseModelId) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
