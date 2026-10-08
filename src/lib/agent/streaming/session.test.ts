import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetStaleThinking, type TurnSession } from '@/lib/agent/streaming/session';
import type { ModelMessage } from '@/lib/agent/types';

const thinking = { type: 'thinking', thinking: 'Plan.', signature: 'sig-1' };

function sessionWith(bindsThinking: boolean) {
  const convo: ModelMessage[] = [
    { role: 'system', content: 'You answer.' },
    { role: 'user', content: 'Find it.' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{}' } }],
      reasoning_details: {
        provider: 'anthropic',
        thinkingBlocks: [thinking],
        content: [thinking, { type: 'tool_use', id: 'c1', name: 'search', input: {} }],
      },
    },
    { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
  ];
  return { bindsThinking, convo } as unknown as TurnSession;
}

/** The reasoning details the round's assistant message carries. */
const details = (session: TurnSession) => {
  const message = session.convo[2];
  return message.role === 'assistant' ? message.reasoning_details : undefined;
};

const withSystem = (session: TurnSession, system: string): ModelMessage[] => [
  { role: 'system', content: system },
  ...session.convo.filter((message) => message.role !== 'system'),
];

test('thinking goes once the system prompt changes mid-turn, and stays gone', () => {
  const session = sessionWith(true);
  forgetStaleThinking(session, session.convo, undefined);
  assert.ok(details(session), 'the first round sets what later rounds compare to');

  // Sources found by the search join the system prompt.
  const later = withSystem(session, 'You answer.\n\nSources: [1] example.org');
  forgetStaleThinking(session, later, undefined);
  assert.deepEqual(details(session), {
    provider: 'anthropic',
    thinkingBlocks: [],
    content: [{ type: 'tool_use', id: 'c1', name: 'search', input: {} }],
  });

  const dropped = details(session);
  forgetStaleThinking(session, later, undefined);
  forgetStaleThinking(session, session.convo, undefined);
  assert.deepEqual(details(session), dropped, 'never put back');
});

test('a model that does not bind its thinking keeps it whatever changes', () => {
  const session = sessionWith(false);
  forgetStaleThinking(session, session.convo, undefined);
  forgetStaleThinking(session, withSystem(session, 'Something else.'), undefined);
  assert.deepEqual((details(session) as { thinkingBlocks: unknown[] }).thinkingBlocks, [thinking]);
});

test("another provider's reasoning details go whole: they hold nothing else", () => {
  const session = sessionWith(true);
  const assistant = session.convo[2];
  if (assistant.role === 'assistant') {
    assistant.reasoning_details = [{ type: 'reasoning.text', text: 'Plan.', signature: 's' }];
  }
  forgetStaleThinking(session, session.convo, undefined);
  forgetStaleThinking(session, session.convo, [
    { type: 'function', function: { name: 'search', parameters: {} } },
  ]);
  assert.equal('reasoning_details' in session.convo[2], false);
});
