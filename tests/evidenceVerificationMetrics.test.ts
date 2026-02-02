import { test } from 'node:test';
import assert from 'node:assert/strict';
import { administerTest } from '@/lib/eval/prePostTest';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import type { KnowledgeGap, TestQuestion } from '@/lib/eval/ablationScenarios';

test('post-test gap questions include invalid-JSON evidence attempts in metadata', async () => {
  const question: TestQuestion = {
    id: 'q1',
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

  assert.equal(result.answerMetadata?.[0]?.evidenceQuote, '');
  assert.equal(result.answerMetadata?.[0]?.evidenceVerified, false);
});
