import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSentence, asTheirIdea, joinSentences, withoutEnd } from '@/modules/tutor/lib/text';

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

test("a noted belief always reads as the learner's idea, never as a fact", () => {
  assert.equal(
    asTheirIdea('A vaccine antigen directly attacks and kills the germ'),
    'You thought a vaccine antigen directly attacks and kills the germ.',
  );
  assert.equal(
    asTheirIdea('You thought the vaccine is the germ.'),
    'You thought the vaccine is the germ.',
  );
  assert.equal(
    asTheirIdea('DNA vaccines change your genes'),
    'You thought DNA vaccines change your genes.',
  );
});
