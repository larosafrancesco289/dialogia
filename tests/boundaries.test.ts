import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const assertClientSafe = (relativePath: string) => {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  assert.equal(source.includes('server-only'), false);
  assert.equal(source.includes('.server'), false);
};

// `src/lib/auth/index.ts` had no importers and is gone; the ESLint rule banning
// `@/lib/auth/**/*.server` from `src/components/**` is what guards that boundary now.

test('tools index stays client-safe', () => {
  assertClientSafe('src/lib/tools/index.ts');
});

test('search index stays client-safe', () => {
  assertClientSafe('src/lib/search/index.ts');
});
