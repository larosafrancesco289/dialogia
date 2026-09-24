import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeIndex } from '@/modules/tutor/components/message/hooks/useStepper';

const pending = (answered: string[]) => (item: string) => !answered.includes(item);

test('a card reopens on its first unanswered item', () => {
  assert.equal(resumeIndex(['q1', 'q2', 'q3'], pending(['q1'])), 1);
  assert.equal(resumeIndex(['q1', 'q2', 'q3'], pending([])), 0);
});

test('a finished card reopens on its last item, not its first', () => {
  assert.equal(resumeIndex(['q1', 'q2', 'q3'], pending(['q1', 'q2', 'q3'])), 2);
  assert.equal(resumeIndex([], pending([])), -1);
});
