const TOOL_FENCE_REGEX = /^\s*```([a-z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*/i;
const TOOL_LANGS = new Set(['json', 'jsonc', 'tool', 'function', 'callback']);

function findJsonObjectEnd(value: string): number | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
      if (depth < 0) return null;
    }
  }
  return null;
}

export function stripLeadingToolJson(input: string): string {
  if (!input) return input;
  const trimmed = input.trimStart();
  if (!trimmed) return trimmed;

  const fenceMatch = trimmed.match(TOOL_FENCE_REGEX);
  if (fenceMatch) {
    const lang = fenceMatch[1]?.toLowerCase();
    if (lang && !TOOL_LANGS.has(lang)) return input;
    return trimmed.slice(fenceMatch[0].length).trimStart();
  }

  if (trimmed.startsWith('{')) {
    const endIndex = findJsonObjectEnd(trimmed);
    if (endIndex != null) {
      const jsonCandidate = trimmed.slice(0, endIndex).trim();
      try {
        JSON.parse(jsonCandidate);
      } catch {
        return input;
      }
      return trimmed.slice(endIndex).trimStart();
    }
  }

  return input;
}
