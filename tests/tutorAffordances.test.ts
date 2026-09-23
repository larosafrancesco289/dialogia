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
  const { start, steps, setDirectlyTo } = explainMastery(topic(0.52, [0.5, -0.2]));
  assert.equal(start, MASTERY_PRIOR);
  assert.deepEqual(
    steps.map((s) => [Number(s.before.toFixed(2)), Number(s.after.toFixed(2))]),
    [
      [0.3, 0.65],
      [0.65, 0.52],
    ],
  );
  assert.equal(setDirectlyTo, undefined);
});

test('explainMastery says so when an estimate was set directly', () => {
  // The evidence would give 0.65, but a slider or floor put it at 0.7.
  assert.equal(explainMastery(topic(0.7, [0.5])).setDirectlyTo, 0.7);
});
