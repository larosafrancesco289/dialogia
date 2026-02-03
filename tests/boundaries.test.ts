import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('deepResearch index stays client-safe', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/deep-research/index.ts'), 'utf8');
  assert.equal(source.includes('server-only'), false);
  assert.equal(source.includes('deep-research/server'), false);
  assert.equal(source.includes('.server'), false);
});

const assertClientSafe = (relativePath: string) => {
  const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
  assert.equal(source.includes('server-only'), false);
  assert.equal(source.includes('.server'), false);
};

test('auth index stays client-safe', () => {
  assertClientSafe('src/lib/auth/index.ts');
});

test('tools index stays client-safe', () => {
  assertClientSafe('src/lib/tools/index.ts');
});

test('search index stays client-safe', () => {
  assertClientSafe('src/lib/search/index.ts');
});
