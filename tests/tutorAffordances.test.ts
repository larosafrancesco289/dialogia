import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTutorFlags, tutorAffordances } from '@/modules/tutor/ui/tutorFlags';
import { explainMastery, MASTERY_PRIOR } from '@/modules/tutor/learner-model';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import type { TopicMastery, TutorSettings } from '@/lib/types';

const affordancesFor = (tutor: TutorSettings | undefined) =>
  tutorAffordances(resolveTutorFlags(tutor));

// The paper's 2×2: plan editable × learner model visible-and-editable.
test('full system: every affordance', () => {
  assert.deepEqual(affordancesFor({ planEditable: true, learnerModelVisible: true }), {
    showMastery: true,
    correctMastery: true,
    revisePlan: true,
  });
});

test('plan only: the plan can change, mastery never reaches the learner', () => {
  assert.deepEqual(affordancesFor({ planEditable: true, learnerModelVisible: false }), {
    showMastery: false,
    correctMastery: false,
    revisePlan: true,
  });
});

test('model only: mastery is shown and correctable, the plan is read-only', () => {
  assert.deepEqual(affordancesFor({ planEditable: false, learnerModelVisible: true }), {
    showMastery: true,
    correctMastery: true,
    revisePlan: false,
  });
});

test('baseline: a read-only plan and a hidden learner model', () => {
  assert.deepEqual(affordancesFor({ planEditable: false, learnerModelVisible: false }), {
    showMastery: false,
    correctMastery: false,
    revisePlan: false,
  });
});

test('a visible but read-only learner model separates inspecting from negotiating', () => {
  assert.deepEqual(
    affordancesFor({ planEditable: false, learnerModelVisible: true, learnerModelEditable: false }),
    { showMastery: true, correctMastery: false, revisePlan: false },
  );
  // Editable without visible is not a state: nothing hidden can be corrected.
  assert.equal(
    affordancesFor({ learnerModelVisible: false, learnerModelEditable: true }).correctMastery,
    false,
  );
});

test('unset flags mean an ordinary chat with every affordance', () => {
  assert.deepEqual(affordancesFor(undefined), {
    showMastery: true,
    correctMastery: true,
    revisePlan: true,
  });
});

test('the condition flags survive settings normalization', () => {
  const settings = normalizeChatSettings(
    {
      modelId: 'm',
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: {
          enabled: true,
          planEditable: false,
          learnerModelVisible: true,
          learnerModelEditable: false,
        },
      },
    },
    { fallbackModelId: 'm', fallbackTutorModelId: 't' },
  );
  assert.equal(settings.features.tutor?.planEditable, false);
  assert.equal(settings.features.tutor?.learnerModelVisible, true);
  assert.equal(settings.features.tutor?.learnerModelEditable, false);
});

const topic = (confidence: number, weights: number[]): TopicMastery => ({
  nodeId: 'n',
  confidence,
  interactions: weights.length,
  lastInteraction: 0,
  evidence: weights.map((weight, i) => ({
    timestamp: i,
    type: weight >= 0 ? 'correct_answer' : 'incorrect_answer',
    details: `e${i}`,
    weight,
  })),
  misconceptions: [],
});

test('explainMastery replays evidence from the prior to the current estimate', () => {
  // 0.3 → +0.5 → 0.65 → −0.2 → 0.52
  const { start, steps } = explainMastery(topic(0.52, [0.5, -0.2]));
  assert.equal(start, MASTERY_PRIOR);
  assert.deepEqual(
    steps.map((s) => [Number(s.before.toFixed(2)), Number(s.after.toFixed(2))]),
    [
      [0.3, 0.65],
      [0.65, 0.52],
    ],
  );
  assert.ok(steps.every((s) => s.evidence));
});

const round = (steps: { before: number; after: number; evidence?: unknown }[]) =>
  steps.map((s) => [
    s.evidence ? 'e' : 'set',
    Number(s.before.toFixed(2)),
    Number(s.after.toFixed(2)),
  ]);

test('explainMastery places an unrecorded direct set so the steps add up', () => {
  // Older history: set to 0.42 somewhere, then +0.15 reached 0.507. Replayed
  // backwards from the current value, the set comes first.
  const { steps } = explainMastery(topic(0.507, [0.15]));
  assert.deepEqual(round(steps), [
    ['set', 0.3, 0.42],
    ['e', 0.42, 0.51],
  ]);
});

test('explainMastery replays a recorded direct set exactly', () => {
  const t = topic(0.73, [0.5]);
  t.evidence.push({ timestamp: 2, type: 'self_report', details: '', weight: 0, setTo: 0.7 });
  t.evidence.push({ timestamp: 3, type: 'correct_answer', details: 'e3', weight: 0.1 });
  const { steps } = explainMastery(t);
  assert.deepEqual(round(steps), [
    ['e', 0.3, 0.65],
    ['e', 0.65, 0.7],
    ['e', 0.7, 0.73],
  ]);
  assert.equal(steps[1].evidence?.setTo, 0.7);
});
