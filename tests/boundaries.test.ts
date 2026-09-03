import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const assertClientSafe = (relativePath: string) => {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  assert.equal(source.includes('server-only'), false);
  assert.equal(source.includes('.server'), false);
};

// The app is a static bundle. Nothing the browser imports may be marked server-only.

test('tools index stays client-safe', () => {
  assertClientSafe('src/lib/tools/index.ts');
});

test('search index stays client-safe', () => {
  assertClientSafe('src/lib/search/index.ts');
});
