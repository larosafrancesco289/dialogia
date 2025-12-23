export type ArgMap = Record<string, string | boolean>;

export function parseArgs(argv: string[]): ArgMap {
  const result: ArgMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;
    if (token === '-h' || token === '--help') {
      result.help = true;
      continue;
    }
    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      if (eqIndex > 2) {
        const key = token.slice(2, eqIndex);
        const value = token.slice(eqIndex + 1);
        result[key] = value;
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}
