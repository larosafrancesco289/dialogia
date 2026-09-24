import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSentence, joinSentences, withoutEnd } from '@/modules/tutor/lib/text';

test('a sentence ends exactly once, its own ! or ? kept, inside quotes too', () => {
  assert.equal(asSentence('Saw why'), 'Saw why.');
  assert.equal(asSentence('Saw why.'), 'Saw why.');
  assert.equal(asSentence('  Saw why;  '), 'Saw why.');
  assert.equal(
    asSentence('Quiz, right: "What does P(A|B) describe?"'),
    'Quiz, right: "What does P(A|B) describe?"',
  );
  assert.equal(asSentence('Ready!'), 'Ready!');
  assert.equal(asSentence(''), '');
});

test('joined sentences never double up and drop empty parts', () => {
  assert.equal(
    joinSentences('Welcome back!', 'Goal: "Solve it"', '', undefined, 'Ask away.'),
    'Welcome back! Goal: "Solve it". Ask away.',
  );
});

test('quoted text loses its own closing punctuation', () => {
  assert.equal(
    withoutEnd('Solve conditional probability problems.'),
    'Solve conditional probability problems',
  );
  assert.equal(withoutEnd('Is it..'), 'Is it');
});
