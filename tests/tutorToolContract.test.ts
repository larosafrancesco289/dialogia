import { test } from 'node:test';
import assert from 'node:assert/strict';
import '@/lib/tools';
import {
  TUTOR_TOOL_NAMES,
  getTutorToolDefinitions,
  getTutorToolsByPhase,
  getTutorToolsByTag,
  isTutorToolName,
} from '@/lib/agent/tools/tutor/register';

test('tutor tool registry exposes one definition for every tutor tool name', () => {
  const definitions = getTutorToolDefinitions();
  const definitionNames = definitions.map((definition) => definition.function.name);

  assert.deepEqual(definitionNames, [...TUTOR_TOOL_NAMES]);
  for (const name of TUTOR_TOOL_NAMES) {
    assert.equal(isTutorToolName(name), true);
  }
});

test('tutor tool registry keeps required phase and tag groups populated', () => {
  assert.ok(getTutorToolsByPhase('intake').includes('ask_student_question'));
  assert.ok(getTutorToolsByPhase('diagnostic').includes('create_diagnostic'));
  assert.ok(getTutorToolsByPhase('teaching').includes('advance_topic'));
  assert.ok(getTutorToolsByTag('quiz').includes('quiz'));
  assert.ok(getTutorToolsByTag('learnerModel').includes('record_learning'));
  assert.ok(getTutorToolsByTag('plan').includes('learning_plan'));
});
