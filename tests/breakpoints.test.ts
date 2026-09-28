import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';

// The phone app is chosen twice: in JS (MEDIA_QUERIES.mobile picks the shell)
// and in CSS (every phone rule). CSS cannot import the query, so it is written
// out; this keeps each copy the same query, or the page gets one layout's
// markup in the other's styles.
const PHONE = MEDIA_QUERIES.mobile;
const [PHONE_WIDTH, PHONE_LANDSCAPE] = PHONE.split(', ');
const WIDE = `(min-width: ${parseInt(PHONE_WIDTH.replace(/\D+/, ''), 10) + 1}px) and (not (${PHONE_LANDSCAPE}))`;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

test('a phone on its side, short and touched, is the phone app', () => {
  assert.match(PHONE_LANDSCAPE, /\(pointer: coarse\)/);
  assert.match(PHONE_LANDSCAPE, /\(max-height: 499px\)/);
  assert.match(PHONE_LANDSCAPE, /\(max-width: 1023px\)/);
});

test('every CSS rule for the phone app, or for wider, uses the same query as the shell', () => {
  const files = [
    ...cssFiles(join(process.cwd(), 'styles')),
    ...cssFiles(join(process.cwd(), 'src')),
  ];
  const stray: string[] = [];
  let seen = 0;
  for (const path of files) {
    for (const [, params] of readFileSync(path, 'utf8').matchAll(/@media\s+([^{]+?)\s*\{/g)) {
      if (!/\b76[78]px\b/.test(params)) continue;
      seen += 1;
      if (params !== PHONE && params !== WIDE) {
        stray.push(`${relative(process.cwd(), path)}: ${params}`);
      }
    }
  }
  assert.ok(seen > 0);
  assert.deepEqual(stray, []);
});

test("Tailwind's sm: starts where the phone app ends", () => {
  const globals = readFileSync(join(process.cwd(), 'styles/globals.css'), 'utf8');
  assert.ok(globals.includes(`@custom-variant sm (@media ${WIDE});`));
});
