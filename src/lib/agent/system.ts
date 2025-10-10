// Module: agent/system
// Responsibility: Compose system prompts from base strings, preambles, and optional appendices.

export function combineSystem(
  baseSystem?: string,
  preambles: Array<string | undefined> = [],
  sourceAppendix?: string,
): string | undefined {
  const normalized = preambles
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  if (typeof baseSystem === 'string' && baseSystem.trim()) normalized.push(baseSystem.trim());
  if (normalized.length === 0 && !sourceAppendix) return undefined;
  let combined = normalized.join('\n\n');
  if (typeof sourceAppendix === 'string' && sourceAppendix.trim()) {
    combined += sourceAppendix.startsWith('\n') ? sourceAppendix : `\n\n${sourceAppendix.trim()}`;
  }
  return combined || undefined;
}
