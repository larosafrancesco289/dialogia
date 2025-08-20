// Helpers for cleaning model outputs that may echo tool-call JSON before user-facing text

// Remove leading JSON blobs or fenced JSON blocks that look like tool-call arguments
export function stripLeadingToolJson(input: string): string {
  let s = input || '';
  while (true) {
    const trimmed = s.trimStart();
    // Handle fenced code blocks first: ```{...}``` or ```json {...}```
    if (trimmed.startsWith('```')) {
      const fenceEnd = trimmed.indexOf('```', 3);
      if (fenceEnd > 0) {
        const fenced = trimmed.slice(3, fenceEnd).trim();
        // Remove only if the fenced block looks like our tool-call JSON
        if (/\{[\s\S]*\}/.test(fenced) && /"(query|name)"\s*:/.test(fenced)) {
          s = trimmed.slice(fenceEnd + 3);
          continue;
        }
      }
      break;
    }
    if (trimmed.startsWith('{')) {
      // Only strip if this looks like our tool-call JSON
      if (!/"(query|name)"\s*:/.test(trimmed.slice(0, 200))) break;
      let depth = 0;
      let inString = false;
      let escaped = false;
      let end = -1;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
      }
      if (end === -1) break;
      s = trimmed.slice(end);
      continue;
    }
    break;
  }
  return s.trimStart();
}

