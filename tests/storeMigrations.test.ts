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

test('migrate drops the research-study ui fields and keeps the rest', () => {
  const persisted: Record<string, unknown> = {
    selectedChatId: 'chat-1',
    favoriteModelIds: ['a/b'],
    ui: {
      showSettings: false,
      sidebarCollapsed: true,
      flags: { experimentalTutor: true },
      tutor: {
        contextMode: 'full',
        defaultModelId: 'a/b',
        forceMode: true,
        autoScroll: true,
        researchMode: 'model_only',
        studyCondition: 'A',
      },
      plan: { rightPanelOpen: true },
    },
  };

  const migrated = migrate(persisted, 6) as Record<string, any>;

  assert.equal(migrated.selectedChatId, 'chat-1');
  assert.deepEqual(migrated.favoriteModelIds, ['a/b']);
  assert.equal(migrated.ui.sidebarCollapsed, true);
  assert.equal(migrated.ui.flags.experimentalTutor, true);
  assert.equal(migrated.ui.plan.rightPanelOpen, true);
  assert.equal(migrated.ui.tutor.contextMode, 'full');
  assert.equal(migrated.ui.tutor.forceMode, true);
  assert.equal(migrated.ui.tutor.autoScroll, true);
  assert.ok(!('researchMode' in migrated.ui.tutor));
  assert.ok(!('studyCondition' in migrated.ui.tutor));
});

test('migrate short-circuits when version is current', () => {
  const persisted = { foo: 'bar' } as any;
  const result = migrate(persisted, STORE_MIGRATION_VERSION);
  assert.strictEqual(result, persisted);
});
