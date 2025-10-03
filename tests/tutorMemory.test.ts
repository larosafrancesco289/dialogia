import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTutorMemory,
  enforceTutorMemoryLimit,
  EMPTY_TUTOR_MEMORY,
} from '@/lib/agent/tutorMemory';

test('normalizeTutorMemory adds required sections and prefix', () => {
  const normalized = normalizeTutorMemory('- Goals:\n  - Master calculus');
  assert.ok(normalized.startsWith('Memory:'));
  assert.ok(normalized.includes('- Progress:'));
  assert.ok(normalized.includes('- Preferences:'));
});

test('normalizeTutorMemory falls back to empty template when blank', () => {
  assert.equal(normalizeTutorMemory(''), EMPTY_TUTOR_MEMORY);
});

test('enforceTutorMemoryLimit trims oversized memory blocks', () => {
  const large =
    'Memory:\n- Goals:\n' +
    Array.from({ length: 400 }, (_, i) => `  - Item number ${i}`).join('\n') +
    '\n- Progress:\n  - Still improving';
  const trimmed = enforceTutorMemoryLimit(large);
  // Ensure trimming preserved the Memory prefix and did not return the original text
  assert.ok(trimmed.startsWith('Memory:'));
  assert.notEqual(trimmed, large);
});
