import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHiddenTutorContent,
  ensureTutorDefaults,
  mergeTutorPayload,
  maybeAdvanceTutorMemory,
} from './tutorFlow';
import {
  DEFAULT_TUTOR_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_MODEL_ID,
  DEFAULT_TUTOR_MEMORY_FREQUENCY,
} from '@/lib/constants';

const baseChat = () => ({
  settings: {
    model: 'provider/original',
    tutor_memory: '  {"notes":"keep"}  ',
    tutor_memory_number: undefined,
  },
});

test('buildHiddenTutorContent includes recap and JSON snapshot', () => {
  const tutorPayload = {
    title: 'Fractions Review',
    mcq: [
      {
        id: 'mcq-1',
        question: 'What is 1/2 + 1/2?',
        choices: ['1', '2'],
        correct: 1,
      },
    ],
    attempts: { mcq: { 'mcq-1': { choice: 1, done: true, correct: true } } },
  };
  const hidden = buildHiddenTutorContent(tutorPayload);
  assert.ok(hidden.includes('Tutor Recap'));
  assert.ok(hidden.includes('Tutor Data JSON'));
});

test('ensureTutorDefaults fills missing tutor defaults and normalizes memory', () => {
  const chat = baseChat();
  const ui = { tutorDefaultModelId: '', tutorMemoryModelId: '' } as any;
  const result = ensureTutorDefaults({
    ui,
    chat,
    fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
    fallbackMemoryModelId: DEFAULT_TUTOR_MEMORY_MODEL_ID,
  });
  assert.equal(result.changed, true);
  assert.equal(result.nextSettings.model, DEFAULT_TUTOR_MODEL_ID);
  assert.equal(result.nextSettings.tutor_default_model, DEFAULT_TUTOR_MODEL_ID);
  assert.equal(result.nextSettings.tutor_memory_model, DEFAULT_TUTOR_MEMORY_MODEL_ID);
  assert.equal(result.nextSettings.tutor_memory_message_count, 0);
  assert.equal(result.nextSettings.tutor_memory_frequency, DEFAULT_TUTOR_MEMORY_FREQUENCY);
  const normalized = result.nextSettings.tutor_memory?.trim() || '';
  assert.ok(normalized.startsWith('Memory:'), 'memory is prefixed with heading');
  assert.ok(normalized.includes('{"notes":"keep"}'));
  assert.ok(/-\s*Goals:/i.test(normalized));
});

test('mergeTutorPayload merges patches and rebuilds hidden content', () => {
  const prev = { title: 'Session', mcq: [] };
  const patch = { mcq: [{ id: 'q', question: 'Question?', choices: ['a', 'b'], correct: 0 }] };
  const { merged, hiddenContent } = mergeTutorPayload(prev, patch);
  assert.equal(merged.title, 'Session');
  assert.equal(merged.mcq.length, 1);
  assert.ok(hiddenContent.includes('Tutor Data JSON'));
});

test('maybeAdvanceTutorMemory increments counters when auto-update disabled', async () => {
  const result = await maybeAdvanceTutorMemory({
    apiKey: 'ignored',
    modelId: DEFAULT_TUTOR_MODEL_ID,
    settings: {
      tutor_memory: '{}',
      tutor_memory_message_count: 0,
      tutor_memory_version: 0,
      tutor_memory_frequency: 2,
    },
    conversation: [],
    autoUpdate: false,
  });
  assert.equal(result.nextSettings.tutor_memory_message_count, 1);
  assert.equal(result.nextSettings.tutor_memory_version, 0);
  assert.equal(result.debug, undefined);
});
