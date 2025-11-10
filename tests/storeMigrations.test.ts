import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';
import type { StoreState } from '@/lib/store/types';

test('migrateToV2 normalizes search settings and strips deprecated ui fields', () => {
  const persisted: Partial<StoreState> = {
    chats: [
      {
        id: 'chat-1',
        title: 'Example',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings: {
          search_with_brave: true,
        },
      } as any,
    ],
    messages: {
      'chat-1': [
        {
          id: 'message-1',
          role: 'assistant',
          content: [],
          genSettings: { search_with_brave: false },
          settings: { search_with_brave: true },
        } as any,
      ],
    },
    ui: {
      showSettings: false,
      isStreaming: false,
      nextSearchWithBrave: true,
      tutorMemoryModelId: 'model',
      tutorMemoryFrequency: 'weekly',
      tutorMemoryAutoUpdate: true,
      tutorGlobalMemory: 'notes',
      tutorMemoryDebugByMessageId: { 'message-1': {} },
    } as any,
  };

  const migrated = migrate(persisted, 1);

  const chatSettings = migrated.chats?.[0]?.settings as Record<string, any>;
  assert.equal(chatSettings.search_enabled, true);
  assert.ok(!('search_with_brave' in chatSettings));

  const migratedMessage = migrated.messages?.['chat-1']?.[0] as Record<string, any>;
  assert.equal(migratedMessage.genSettings.search_enabled, false);
  assert.ok(!('search_with_brave' in migratedMessage.genSettings));
  assert.equal(migratedMessage.settings.search_enabled, true);

  const migratedUi = migrated.ui as Record<string, any>;
  assert.equal(migratedUi.nextSearchEnabled, true);
  assert.ok(!('nextSearchWithBrave' in migratedUi));
  assert.ok(!('tutorMemoryModelId' in migratedUi));
  assert.ok(!('tutorGlobalMemory' in migratedUi));
});

test('migrate short-circuits when version is current', () => {
  const persisted = { foo: 'bar' } as any;
  const result = migrate(persisted, 2);
  assert.strictEqual(result, persisted);
});

