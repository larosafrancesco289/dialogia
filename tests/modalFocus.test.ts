import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');
// An attribute on an element, not a selector looking for one ('[role="dialog"]').
const DECLARES_MODAL = /(?<!\[)(aria-modal="true"|role="dialog")|<DialogSurface\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

// Every modal moves focus in, traps Tab, closes on Escape and hands focus
// back through the one shared hook; a hand-rolled keydown listener misses the
// stacking rules (only the top dialog answers).
test('every modal dialog is on the shared useModalFocus hook', () => {
  const missing = sourceFiles(ROOT)
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      return DECLARES_MODAL.test(source) && !source.includes('useModalFocus(');
    })
    .map((path) => relative(process.cwd(), path));
  assert.deepEqual(missing, []);
});
