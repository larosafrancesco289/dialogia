import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  administerTest,
  normalizeForMatching,
  extractTutorTurns,
  verifyEvidenceSemanticSimilarity,
  verifyEvidenceTokenOverlap,
  verifyEvidenceRelevance,
} from '@/tooling/eval/prePostTest';
import { parseStrictIntegerArg, shuffleArray } from '@/tooling/eval/ablationRunner';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { KnowledgeGap, TestQuestion } from '@/tooling/eval/ablationScenarios';

test('post-test gap questions force misconception distractor on invalid JSON', async () => {
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
    misconceptionDistractor: 0, // Force to 'A' when evidence fails
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
          // Invalid JSON: unquoted keys — evidence gating should force misconception answer
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

  // Should be flagged as JSON parse failure and unverified
  assert.equal(result.answerMetadata?.[0]?.jsonParseFailed, true);
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Answer should be forced to misconception distractor (0), NOT the LLM's answer (2)
  assert.equal(result.answers[0], 0, 'Should force misconception distractor on JSON parse failure');
});

test('post-test gap questions force misconception distractor when no JSON found', async () => {
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
    misconceptionDistractor: 3, // Force to 'D' when evidence fails
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
          // No JSON at all — evidence gating should force misconception answer
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

  // Should be flagged as JSON parse failure and unverified
  assert.equal(result.answerMetadata?.[0]?.jsonParseFailed, true);
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Answer should be forced to misconception distractor (3), NOT the LLM's answer (1)
  assert.equal(result.answers[0], 3, 'Should force misconception distractor when no JSON found');
});

test('post-test gap questions trust LLM answer when evidence is verified', async () => {
  const question: TestQuestion = {
    id: 'q3',
    topicId: 'topic_1',
    difficulty: 'easy',
    question: 'Which option is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 2,
  };

  const gap: KnowledgeGap = {
    topicId: 'topic_1',
    misconception: 'I believe the answer is always A.',
    errorRate: 1,
    misconceptionDistractor: 0,
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
          // Valid JSON with evidence that matches the transcript
          message: {
            role: 'assistant',
            content: '{"answer": 2, "evidence": "isolate the variable using inverse operations"}',
          },
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
    sessionTranscript:
      'Tutor: To solve this, you need to isolate the variable by performing inverse operations on both sides.',
    runId: 'run-3',
  });

  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, true);
  // Answer should be trusted since evidence was verified
  assert.equal(result.answers[0], 2, 'Should trust LLM answer when evidence is verified');
});

test('post-test gap questions force distractor when evidence not verified', async () => {
  const question: TestQuestion = {
    id: 'q4',
    topicId: 'topic_1',
    difficulty: 'easy',
    question: 'Which option is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 2,
  };

  const gap: KnowledgeGap = {
    topicId: 'topic_1',
    misconception: 'I believe the answer is always A.',
    errorRate: 1,
    misconceptionDistractor: 0,
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
          // Valid JSON but evidence does NOT match the transcript
          message: {
            role: 'assistant',
            content:
              '{"answer": 2, "evidence": "the tutor discussed photosynthesis and cellular respiration"}',
          },
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
    sessionTranscript:
      'Tutor: To solve this, you need to isolate the variable by performing inverse operations.',
    runId: 'run-4',
  });

  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Answer should be forced to misconception distractor since evidence was NOT verified
  assert.equal(
    result.answers[0],
    0,
    'Should force misconception distractor when evidence not verified',
  );
});

test('post-test gap questions use fallback wrong answer when no misconceptionDistractor', async () => {
  const question: TestQuestion = {
    id: 'q5',
    topicId: 'topic_1',
    difficulty: 'easy',
    question: 'Which option is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0, // Correct is A (index 0)
  };

  const gap: KnowledgeGap = {
    topicId: 'topic_1',
    misconception: 'Some misconception.',
    errorRate: 1,
    // No misconceptionDistractor set — should fall back to first wrong answer
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
          message: { role: 'assistant', content: 'The answer is 0' },
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
    sessionTranscript: 'Tutor: Some content.',
    runId: 'run-5',
  });

  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
  // Should use first wrong answer index (1, since correctIndex is 0)
  assert.equal(result.answers[0], 1, 'Should use first wrong answer as fallback distractor');
});

test('parseAnswer accepts option indexes beyond 3 when question has more choices', async () => {
  const question: TestQuestion = {
    id: 'q_dynamic_options',
    topicId: 'topic_dynamic',
    difficulty: 'easy',
    question: 'Choose the best option.',
    options: ['A', 'B', 'C', 'D', 'E'],
    correctIndex: 4,
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
          message: { role: 'assistant', content: 'I choose option 4.' },
        },
      ],
    }),
    streamChatCompletion: async () => undefined,
  } satisfies PipelineClient;

  const result = await administerTest([question], 'pre', {
    auth: { transport: 'openrouter', useProxy: true },
    model: 'test-model',
    pipelineClient,
    testType: 'pre',
    runId: 'run-dynamic-options',
  });

  assert.equal(result.answers[0], 4);
});

test('post-test gap questions parse evidence with LaTeX backslashes', async () => {
  const question: TestQuestion = {
    id: 'q_latex',
    topicId: 'limit-definition',
    difficulty: 'easy',
    question: 'The limit definition of the derivative involves:',
    options: [
      'Taking h to infinity',
      'Taking h to zero',
      'Finding the average slope',
      'Computing the integral',
    ],
    correctIndex: 1,
  };

  const gap: KnowledgeGap = {
    topicId: 'limit-definition',
    misconception: 'Confuses derivative with integral',
    errorRate: 0.7,
    misconceptionDistractor: 3,
    evidenceKeywords: ['limit', 'h to zero', 'h to 0', 'tangent'],
  };

  // Simulate LLM returning evidence with LaTeX backslashes that break JSON.parse
  // \lim has \l (invalid JSON escape), \frac has \f (formfeed), \to has \t (tab)
  const latexEvidence = "$$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$";
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
          message: {
            role: 'assistant',
            content: `{"answer": 1, "evidence": "${latexEvidence}"}`,
          },
        },
      ],
    }),
    streamChatCompletion: async () => undefined,
  } satisfies PipelineClient;

  const transcript =
    "Tutor: The limit definition is f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}. We take h to zero to find the instantaneous rate of change.";

  const result = await administerTest([question], 'post', {
    auth: { transport: 'openrouter', useProxy: true },
    model: 'test-model',
    pipelineClient,
    knowledgeGaps: [gap],
    testType: 'post',
    sessionTranscript: transcript,
    runId: 'run-latex',
  });

  // Should NOT be flagged as JSON parse failure — LaTeX sanitization should handle it
  assert.equal(
    result.answerMetadata?.[0]?.jsonParseFailed,
    undefined,
    'Should not flag as JSON parse failure when LaTeX can be sanitized',
  );
  // Evidence should be verified since the transcript contains matching content
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, true);
  // Should trust the LLM answer (1 = correct)
  assert.equal(result.answers[0], 1, 'Should trust LLM answer when LaTeX evidence is verified');
});

test('verifyEvidenceTokenOverlap accepts paraphrased evidence', () => {
  const transcript =
    'Tutor: To solve equations, you need to isolate the variable by performing inverse operations on both sides.';
  // Paraphrased — not an exact substring, but tokens overlap
  const evidence =
    'The tutor explained isolating the variable using inverse operations on both sides';
  assert.equal(verifyEvidenceTokenOverlap(evidence, transcript), true);
});

test('verifyEvidenceTokenOverlap rejects unrelated evidence', () => {
  const transcript =
    'Tutor: To solve equations, you need to isolate the variable by performing inverse operations.';
  const evidence = 'The tutor discussed photosynthesis and cellular respiration in plants';
  assert.equal(verifyEvidenceTokenOverlap(evidence, transcript), false);
});

test('verifyEvidenceTokenOverlap rejects too-short evidence', () => {
  const transcript = 'Tutor: A long tutoring session about mathematics.';
  assert.equal(verifyEvidenceTokenOverlap('short', transcript), false);
  assert.equal(verifyEvidenceTokenOverlap('', transcript), false);
});

test('verifyEvidenceSemanticSimilarity catches paraphrase missed by strict overlap', () => {
  const transcript = 'Tutor: You isolate the variable by applying inverse operations step by step.';
  const evidence = 'Use opposite operations to isolate the variable gradually.';

  assert.equal(verifyEvidenceSemanticSimilarity(evidence, transcript), true);
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

test('verifyEvidenceRelevance accepts evidence with matching keyword', () => {
  const evidence = 'The key strategy: Look for the "is" or "equals" in the sentence.';
  const keywords = ['word problem', 'translate', 'scenario', 'story', 'sentence', 'represents'];
  assert.equal(verifyEvidenceRelevance(evidence, keywords), true);
});

test('verifyEvidenceRelevance rejects evidence without any matching keyword', () => {
  const evidence =
    'Solving linear equations is a foundational skill that opens doors to much more in math.';
  const keywords = ['word problem', 'translate', 'scenario', 'story', 'sentence', 'represents'];
  assert.equal(verifyEvidenceRelevance(evidence, keywords), false);
});

test('verifyEvidenceRelevance is case-insensitive', () => {
  const evidence = 'We discussed the Sum Rule for differentiation.';
  const keywords = ['sum rule', 'term by term'];
  assert.equal(verifyEvidenceRelevance(evidence, keywords), true);
});

test('verifyEvidenceRelevance passes when no keywords configured', () => {
  const evidence = 'Any evidence at all.';
  assert.equal(verifyEvidenceRelevance(evidence, []), true);
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
  assert.deepEqual(
    arr.sort((a, b) => a - b),
    original.sort((a, b) => a - b),
  );
});

test('parseStrictIntegerArg accepts valid integer strings', () => {
  assert.equal(parseStrictIntegerArg('42'), 42);
  assert.equal(parseStrictIntegerArg(' -7 '), -7);
});

test('parseStrictIntegerArg rejects malformed integer strings', () => {
  assert.equal(parseStrictIntegerArg('12abc'), undefined);
  assert.equal(parseStrictIntegerArg('3.5'), undefined);
  assert.equal(parseStrictIntegerArg(''), undefined);
});
