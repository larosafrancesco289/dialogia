import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';
import { DB_SCHEMA_VERSION } from '@/lib/db/versions';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';

test('store and Dexie versions are defined', () => {
  assert.equal(typeof STORE_MIGRATION_VERSION, 'number');
  assert.equal(typeof DB_SCHEMA_VERSION, 'number');
});

test('migrate drops legacy overrides from ui', () => {
  const legacyState: any = {
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
});
