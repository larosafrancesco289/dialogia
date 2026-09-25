import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeErrorNotice } from '@/lib/store/notices';
import { createTestStore } from '../../../tests/helpers/createTestStoreState';

test('a transport error code reads as words, keeping the status and the detail', () => {
  assert.equal(
    describeErrorNotice(new Error('openrouter_chat_failed (400): model not found')),
    'The model provider returned an error (400): model not found',
  );
});

test('a stop is not an error', () => {
  assert.equal(describeErrorNotice(new DOMException('aborted', 'AbortError')), undefined);
});

test('a notice reads as a problem unless it says otherwise, and clears its tone', () => {
  const store = createTestStore();
  store.getState().setNotice('rateLimited');
  assert.equal(store.getState().ui.noticeTone, 'error');
  store.getState().setNotice('Reasoning effort set to high.', 'info');
  assert.equal(store.getState().ui.noticeTone, 'info');
  store.getState().setNotice(undefined, 'info');
  assert.equal(store.getState().ui.noticeTone, undefined);
});
