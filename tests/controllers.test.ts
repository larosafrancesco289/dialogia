import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTurnController, getTurnController, clearTurnController, abortTurn } from '@/lib/services/controllers';

test('turn controller lifecycle replaces and aborts previous controllers', () => {
  const c1 = new AbortController();
  setTurnController('chat-1', c1);
  assert.strictEqual(getTurnController('chat-1'), c1);

  const c2 = new AbortController();
  setTurnController('chat-1', c2);
  assert.strictEqual(getTurnController('chat-1'), c2);
  assert.equal(c1.signal.aborted, true);

  abortTurn('chat-1');
  assert.equal(c2.signal.aborted, true);
  assert.equal(getTurnController('chat-1'), undefined);
});

test('clearTurnController removes without aborting', () => {
  const controller = new AbortController();
  setTurnController('chat-2', controller);
  clearTurnController('chat-2');
  assert.equal(controller.signal.aborted, false);
  assert.equal(getTurnController('chat-2'), undefined);
});
