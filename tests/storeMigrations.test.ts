import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';

import { STORE_MIGRATION_VERSION } from '@/lib/db/versions';

test('migrate normalizes legacy chat and message settings', () => {
  const persisted: Record<string, unknown> = {
    chats: [
      {
        id: 'chat-1',
        title: 'Example',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings: {
          model: 'model-1',
          search_with_brave: true,
          top_p: 0.7,
          max_tokens: 256,
          show_tool_call_log: true,
          show_debug_raw_json: false,
        },
      } as any,
    ],
    messages: {
      'chat-1': [
        {
          id: 'message-1',
          role: 'assistant',
          content: [],
          genSettings: {
            top_p: 0.2,
            max_tokens: 64,
            search_enabled: true,
            search_provider: 'brave',
          },
          settings: { model: 'model-1', search_enabled: true },
        } as any,
      ],
    },
    ui: {
      showSettings: false,
      nextSearchWithBrave: true,
      tutorMemoryModelId: 'model',
      tutorMemoryFrequency: 'weekly',
      tutorMemoryAutoUpdate: true,
      tutorGlobalMemory: 'notes',
      tutorMemoryDebugByMessageId: { 'message-1': {} },
    } as any,
  };

  const migrated = migrate(persisted, 1) as Record<string, any>;

  const chatSettings = migrated.chats?.[0]?.settings as Record<string, any>;
  assert.equal(chatSettings.modelId, 'model-1');
  assert.equal(chatSettings.generation.topP, 0.7);
  assert.equal(chatSettings.generation.maxTokens, 256);
  assert.equal(chatSettings.ui.showToolCallLog, true);
  assert.equal(chatSettings.ui.showDebugRawJson, false);
  assert.equal(chatSettings.features.search.enabled, true);
  assert.equal(chatSettings.features.search.provider, 'brave');
  assert.ok(!('search_with_brave' in chatSettings));

  const migratedMessage = migrated.messages?.['chat-1']?.[0] as Record<string, any>;
  assert.equal(migratedMessage.genSettings.topP, 0.2);
  assert.equal(migratedMessage.genSettings.maxTokens, 64);
  assert.equal(migratedMessage.genSettings.searchEnabled, true);
  assert.equal(migratedMessage.genSettings.searchProvider, 'brave');
  assert.ok(!('search_enabled' in migratedMessage.genSettings));
  assert.equal(migratedMessage.settings.modelId, 'model-1');
  assert.equal(migratedMessage.settings.features.search.enabled, true);

  const migratedUi = migrated.ui as Record<string, any>;
  assert.equal(migratedUi.overrides, undefined);
  assert.ok(!('nextSearchWithBrave' in migratedUi));
  assert.ok(!('nextSearchEnabled' in migratedUi));
  assert.ok(!('tutorMemoryModelId' in migratedUi));
  assert.ok(!('tutorGlobalMemory' in migratedUi));
});

test('migrate short-circuits when version is current', () => {
  const persisted = { foo: 'bar' } as any;
  const result = migrate(persisted, STORE_MIGRATION_VERSION);
  assert.strictEqual(result, persisted);
});
