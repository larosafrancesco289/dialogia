import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TUTOR_TOOL_NAMES } from '@/lib/tools';

test('TUTOR_TOOL_CONTRACT tool list matches TUTOR_TOOL_NAMES', () => {
  const contractPath = path.join(process.cwd(), 'TUTOR_TOOL_CONTRACT.md');
  const content = fs.readFileSync(contractPath, 'utf8');
  const sectionMatch = content.match(/## Tool Names[\s\S]*?(?=## |\n# |\n$)/);
  assert.ok(sectionMatch, 'Tool Names section not found');

  const lines = sectionMatch[0].split('\n');
  const listed = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- `'))
    .map((line) => {
      const match = line.match(/`([^`]+)`/);
      return match ? match[1] : '';
    })
    .filter(Boolean);

  assert.deepEqual(listed, [...TUTOR_TOOL_NAMES]);
});
