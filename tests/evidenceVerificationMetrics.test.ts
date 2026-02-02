import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  administerTest,
  normalizeForMatching,
  extractTutorTurns,
} from '@/lib/eval/prePostTest';
import { shuffleArray } from '@/lib/eval/ablationRunner';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { KnowledgeGap, TestQuestion } from '@/lib/eval/ablationScenarios';

test('post-test gap questions force wrong answer on invalid JSON', async () => {
  const question: TestQuestion = {
    id: 'q1',
    topicId: 'topic_1',
    difficulty: 'easy',
    question: 'Which option is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 2, // Correct answer is index 2 (C)
  };

  const gap: KnowledgeGap = {
    topicId: 'topic_1',
    misconception: 'I believe the answer is always A.',
    errorRate: 1,
  };

  const pipelineClient = {
    chatCompletion: async () => ({
      id: 'test-completion',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          // Invalid JSON: unquoted keys
          message: { role: 'assistant', content: '{answer: 2, evidence: "not valid JSON"}' },
        },
      ],
    }),
    streamChatCompletion: async () => undefined,
  } satisfies PipelineClient;

  const result = await administerTest([question], 'post', {
    auth: { transport: 'openrouter', useProxy: true },
    model: 'test-model',
    pipelineClient,
    knowledgeGaps: [gap],
    testType: 'post',
    sessionTranscript: 'A tutoring transcript that does not matter for this test.',
    runId: 'run-1',
  });

  // Should have forced a wrong answer due to JSON parse failure
  assert.equal(result.answerMetadata?.[0]?.jsonParseFailed, true);
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Answer should NOT be the correct index (2)
  assert.notEqual(result.answers[0], 2, 'Invalid JSON should force wrong answer');
});

test('post-test gap questions force wrong answer when no JSON found', async () => {
  const question: TestQuestion = {
    id: 'q2',
    topicId: 'topic_1',
    difficulty: 'easy',
    question: 'Which option is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 1,
  };

  const gap: KnowledgeGap = {
    topicId: 'topic_1',
    misconception: 'I think B is wrong.',
    errorRate: 1,
  };

  const pipelineClient = {
    chatCompletion: async () => ({
      id: 'test-completion',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          // No JSON at all, just text with the correct answer
          message: { role: 'assistant', content: 'The answer is 1' },
        },
      ],
    }),
    streamChatCompletion: async () => undefined,
  } satisfies PipelineClient;

  const result = await administerTest([question], 'post', {
    auth: { transport: 'openrouter', useProxy: true },
    model: 'test-model',
    pipelineClient,
    knowledgeGaps: [gap],
    testType: 'post',
    sessionTranscript: 'Tutor: Here is some content.',
    runId: 'run-2',
  });

  // Should have forced a wrong answer due to no JSON found
  assert.equal(result.answerMetadata?.[0]?.jsonParseFailed, true);
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Answer should NOT be the correct index (1)
  assert.notEqual(result.answers[0], 1, 'Missing JSON should force wrong answer');
});

test('normalizeForMatching collapses whitespace and lowercases', () => {
  const input = '  Hello   World  \n\t  Test  ';
  const expected = 'hello world test';
  assert.equal(normalizeForMatching(input), expected);
});

test('normalizeForMatching handles empty string', () => {
  assert.equal(normalizeForMatching(''), '');
  assert.equal(normalizeForMatching('   '), '');
});

test('extractTutorTurns extracts only tutor content', () => {
  const transcript = `Student: Hello, I need help.

Tutor: Sure, let me explain the concept.

Student: I don't understand.

Tutor (thinking): Let me try a different approach.

Student: Thanks, that makes sense.`;

  const tutorOnly = extractTutorTurns(transcript);
  assert.ok(tutorOnly.includes('Tutor: Sure, let me explain'));
  assert.ok(tutorOnly.includes('Tutor (thinking): Let me try'));
  assert.ok(!tutorOnly.includes('Student:'));
});

test('extractTutorTurns returns empty for student-only transcript', () => {
  const transcript = `Student: Hello.

Student: Another message.`;

  const tutorOnly = extractTutorTurns(transcript);
  assert.equal(tutorOnly, '');
});

test('shuffleArray produces deterministic results with same seed', () => {
  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  shuffleArray(arr1, 12345);
  shuffleArray(arr2, 12345);

  assert.deepEqual(arr1, arr2);
});

test('shuffleArray produces different results with different seeds', () => {
  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  shuffleArray(arr1, 12345);
  shuffleArray(arr2, 54321);

  assert.notDeepEqual(arr1, arr2);
});

test('shuffleArray actually shuffles the array', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const original = [...arr];

  shuffleArray(arr, 42);

  // Array should be modified (extremely unlikely to remain in original order)
  assert.notDeepEqual(arr, original);
  // But should contain the same elements
  assert.equal(arr.length, original.length);
  assert.deepEqual(arr.sort((a, b) => a - b), original.sort((a, b) => a - b));
});
