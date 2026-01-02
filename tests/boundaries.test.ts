import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('deepResearch index stays client-safe', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/deepResearch/index.ts'), 'utf8');
  assert.equal(source.includes('server-only'), false);
  assert.equal(source.includes('deepResearch/server'), false);
  assert.equal(source.includes('.server'), false);
});
