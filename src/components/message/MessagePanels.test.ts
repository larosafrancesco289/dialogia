import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { getReasoningPanelState } from './MessagePanels';

test('does not render reasoning panel for requested reasoning before reasoning tokens arrive', () => {
  const message = createAssistantMessage({
    chatId: 'chat-1',
    content: '',
    model: 'openai/o4-mini',
    genSettings: {
      reasoningEffort: 'medium',
    },
  });

  const state = getReasoningPanelState({
    message,
    isStreaming: true,
    lastMessageId: message.id,
  });

  assert.equal(state.shouldRender, false);
  assert.equal(state.shouldStream, false);
});

test('renders reasoning panel once actual reasoning text exists', () => {
  const message = createAssistantMessage({
    chatId: 'chat-1',
    content: 'Hello there.',
    model: 'openai/o4-mini',
    reasoning: 'Checking whether a brief response needs extra work.',
    genSettings: {
      reasoningEffort: 'medium',
    },
  });

  const state = getReasoningPanelState({
    message,
    isStreaming: true,
    lastMessageId: message.id,
  });

  assert.equal(state.shouldRender, true);
  assert.equal(state.shouldStream, true);
});

test('a reply cost reads in dollars, and a tiny one says so', async () => {
  const { formatCost } = await import('@/components/message/MessageColophon');
  assert.equal(formatCost(0.00002, 'usd'), 'under $0.0001');
  assert.equal(formatCost(0.0021, 'USD'), '$0.0021');
  assert.equal(formatCost(0.341, 'usd'), '$0.34');
});
