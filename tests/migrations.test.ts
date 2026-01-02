import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';
import { DB_SCHEMA_VERSION, STORE_MIGRATION_VERSION } from '@/lib/db/versions';

test('store and Dexie versions stay aligned', () => {
  assert.equal(STORE_MIGRATION_VERSION, DB_SCHEMA_VERSION);
});

test('migrate drops legacy overrides and normalizes chat settings', () => {
  const legacyState: any = {
    chats: [
      {
        id: 'chat-1',
        title: 'Test',
        createdAt: 0,
        updatedAt: 0,
        settings: {
          model: 'model-x',
          search_with_brave: true,
          max_tokens: 120,
          show_stats: true,
        },
      },
    ],
    messages: {},
    ui: {
      showSettings: false,
      nextModel: 'model-x',
      nextSearchEnabled: true,
      nextSearchWithBrave: true,
      nextTutorMode: true,
      tutorMemoryModelId: 'old',
    },
  };

  const migrated = migrate(legacyState, 1) as any;
  assert.ok(migrated.ui);
  assert.equal(migrated.ui.overrides, undefined);
  assert.ok(!('nextModel' in migrated.ui));
  assert.ok(!('nextSearchEnabled' in migrated.ui));

  const settings = migrated.chats?.[0]?.settings as Record<string, any>;
  assert.equal(settings.modelId, 'model-x');
  assert.equal(settings.generation?.maxTokens, 120);
  assert.equal(settings.ui?.showStats, true);
  assert.equal(settings.features?.search?.enabled, true);
  assert.equal(settings.features?.search?.provider, 'brave');
  assert.ok(!('search_enabled' in settings));
  assert.ok(!('search_with_brave' in settings));
});
