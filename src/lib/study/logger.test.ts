import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeSession,
  logAction,
  setSessionCondition,
  setStudyModeEnabled,
  endSession,
} from './logger';
import { clearAllStudyStorage, getStudySession } from './storage';

type MemoryStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  length: number;
};

function createMemoryStorage(): MemoryStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index) => {
      const keys = Array.from(map.keys());
      return keys[index] ?? null;
    },
    get length() {
      return map.size;
    },
  };
}

const originalWindow = (globalThis as Record<string, unknown>).window;
const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;

beforeEach(() => {
  const memoryStorage = createMemoryStorage();
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = memoryStorage;
  clearAllStudyStorage();
  setStudyModeEnabled(false);
});

afterEach(() => {
  clearAllStudyStorage();
  setStudyModeEnabled(false);
  if (originalWindow === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }
  if (originalLocalStorage === undefined) {
    delete (globalThis as Record<string, unknown>).localStorage;
  } else {
    (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
  }
});

test('logAction is gated when study mode is disabled', () => {
  initializeSession('P001', 'A');
  logAction('plan_exposed', {
    chatId: 'chat-1',
    planUpdatedAt: 123,
    source: 'learning_panel',
  });

  const session = getStudySession();
  assert.ok(session);
  assert.equal(session.entries.length, 1);
  assert.equal(session.entries[0].action, 'session_start');
});

test('setSessionCondition appends condition_changed and future events use new condition', () => {
  setStudyModeEnabled(true);
  initializeSession('P001', 'A');
  setSessionCondition('B');
  logAction('plan_exposed', {
    chatId: 'chat-2',
    planUpdatedAt: 456,
    source: 'learning_panel',
  });

  const session = getStudySession();
  assert.ok(session);
  assert.equal(session.condition, 'B');
  assert.equal(session.entries.length, 3);
  assert.equal(session.entries[1].action, 'condition_changed');
  assert.equal(session.entries[1].condition, 'B');
  assert.equal(session.entries[2].action, 'plan_exposed');
  assert.equal(session.entries[2].condition, 'B');
});

test('new investigation events persist typed metadata', () => {
  setStudyModeEnabled(true);
  initializeSession('P001', 'B');

  logAction('plan_node_inspected', {
    nodeId: 'topic-1',
    nodeName: 'Topic 1',
    section: 'in_progress',
    dwellMs: 9500,
    interactionCount: 3,
    depth: 'deep',
  });

  const session = getStudySession();
  assert.ok(session);
  const latest = session.entries[session.entries.length - 1];
  assert.equal(latest.action, 'plan_node_inspected');
  assert.deepEqual(latest.metadata, {
    nodeId: 'topic-1',
    nodeName: 'Topic 1',
    section: 'in_progress',
    dwellMs: 9500,
    interactionCount: 3,
    depth: 'deep',
  });

  endSession();
});
