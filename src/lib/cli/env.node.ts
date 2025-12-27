import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

export function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function loadEnvDefaults(filenames: string[] = ['.env.local', '.env']): Promise<void> {
  for (const filename of filenames) {
    try {
      const fullPath = path.resolve(process.cwd(), filename);
      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        if (!key) continue;
        if (process.env[key]) continue;
        const value = normalizeEnvValue(line.slice(idx + 1));
        if (!value) continue;
        process.env[key] = value.replace(/\\n/g, '\n');
      }
    } catch {
      // Missing env file is fine; continue to the next candidate.
    }
  }
}
