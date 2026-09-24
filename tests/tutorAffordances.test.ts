import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTutorFlags, tutorAffordances } from '@/modules/tutor/ui/tutorFlags';
import { normalizeChatSettings } from '@/lib/settings/normalize';
import type { TutorSettings } from '@/lib/types';

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
