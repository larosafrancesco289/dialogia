import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnEffects, type TurnEffectsContext } from '@/lib/agent/orchestrator/turnEffects';
import type { ModuleRuntime } from '@/lib/modules';
import type { TurnComposition } from '@/lib/agent/types';
import type { Chat } from '@/lib/types';

const context: TurnEffectsContext = {
  chatId: 'chat1',
  assistantMessageId: 'assistant1',
  isPrimary: true,
  priorMessages: [],
  getChatForTurn: () => ({}) as Chat,
  set: () => {},
};

test('turn effects resolve modules at first hook call, not at creation', () => {
  // Regression: the lifecycle is created before loadModuleRuntimes() resolves on a
  // cold page; an eager snapshot captured an empty list and dropped every module
  // effect on the first turn per session.
  let available: ModuleRuntime[] = [];
  let created = 0;
  const runtime: ModuleRuntime = {
    turnEffects: () => {
      created += 1;
      return { messagePatch: () => ({ model: 'patched' }) };
    },
  };

  const effects = createTurnEffects(context, () => available);
  available = [runtime];

  assert.deepEqual(effects.messagePatch(), { model: 'patched' });
  assert.equal(created, 1);
});

test('turn effects are created once and keep per-turn state across hooks', () => {
  let created = 0;
  const runtime: ModuleRuntime = {
    turnEffects: () => {
      created += 1;
      let compositions = 0;
      return {
        onComposition: () => {
          compositions += 1;
        },
        messagePatch: () => ({ tokensOut: compositions }),
      };
    },
  };

  const effects = createTurnEffects(context, () => [runtime]);
  effects.onComposition({} as TurnComposition);
  effects.onComposition({} as TurnComposition);

  assert.deepEqual(effects.messagePatch(), { tokensOut: 2 });
  assert.equal(created, 1);
});
