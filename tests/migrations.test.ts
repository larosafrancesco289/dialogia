import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';
import { DB_SCHEMA_VERSION, STORE_MIGRATION_VERSION } from '@/lib/db/versions';

test('store and Dexie versions stay aligned', () => {
  assert.equal(STORE_MIGRATION_VERSION, DB_SCHEMA_VERSION);
});

test('migrate flattens legacy overrides and search flags', () => {
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
        },
      },
    ],
    messages: {},
    ui: {
      nextModel: 'model-x',
      nextSearchEnabled: true,
      nextSearchWithBrave: true,
      nextTutorMode: true,
      tutorMemoryModelId: 'old',
    },
  };

  const migrated = migrate(legacyState, 1) as any;
  assert.ok(migrated.ui);
  assert.equal(migrated.ui.next?.model, 'model-x');
  assert.equal(migrated.ui.next?.search?.enabled, true);
  assert.equal(migrated.ui.next?.tutorMode, true);
  assert.ok(!('nextModel' in migrated.ui));
  assert.ok(!('nextSearchEnabled' in migrated.ui));
  assert.equal(migrated.chats?.[0]?.settings?.search_enabled, true);
  assert.equal(migrated.chats?.[0]?.settings?.search_with_brave, undefined);
});
