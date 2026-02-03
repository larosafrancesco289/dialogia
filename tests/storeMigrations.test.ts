import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';

test('migrate strips deprecated ui fields only', () => {
  const persisted: Record<string, unknown> = {
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
