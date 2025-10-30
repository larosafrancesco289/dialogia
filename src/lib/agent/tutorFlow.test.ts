import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHiddenTutorContent, ensureTutorDefaults, mergeTutorPayload } from './tutorFlow';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';

const baseChat = () => ({
  settings: {
    model: 'provider/original',
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

test('ensureTutorDefaults fills missing tutor defaults and enables learner model', () => {
  const chat = baseChat();
  const ui = { tutorDefaultModelId: '' } as any;
  const result = ensureTutorDefaults({
    ui,
    chat,
    fallbackDefaultModelId: DEFAULT_TUTOR_MODEL_ID,
  });
  assert.equal(result.changed, true);
  assert.equal(result.nextSettings.model, DEFAULT_TUTOR_MODEL_ID);
  assert.equal(result.nextSettings.tutor_default_model, DEFAULT_TUTOR_MODEL_ID);
  assert.equal(result.nextSettings.enableLearnerModel, true);
  assert.equal(result.nextSettings.learnerModelUpdateFrequency, 3);
});

test('mergeTutorPayload merges patches and rebuilds hidden content', () => {
  const prev = { title: 'Session', mcq: [] };
  const patch = { mcq: [{ id: 'q', question: 'Question?', choices: ['a', 'b'], correct: 0 }] };
  const { merged, hiddenContent } = mergeTutorPayload(prev, patch);
  assert.equal(merged.title, 'Session');
  assert.equal(merged.mcq.length, 1);
  assert.ok(hiddenContent.includes('Tutor Data JSON'));
});
