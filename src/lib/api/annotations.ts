// Module: api/annotations
// Responsibility: One list of a reply's annotations (the citations its sources
// come from) out of the pieces a provider sends them in.

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

/**
 * `next`'s annotations after `current`'s, each once. A stream's later chunks,
 * and a reply's later rounds, repeat citations or resend the whole list.
 */
export function mergeAnnotations(current: unknown, next: unknown): unknown[] {
  const merged = [...asList(current)];
  const seen = new Set(merged.map((annotation) => JSON.stringify(annotation)));
  for (const annotation of asList(next)) {
    const key = JSON.stringify(annotation);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(annotation);
  }
  return merged;
}
