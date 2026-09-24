import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleRuntimes } from '@/lib/modules';
import { getTool, listTools } from '@/lib/tools/registry';
import { TOOL_ENDS_TURN, TUTOR_TOOLS, TUTOR_TOOL_NAMES } from '@/modules/tutor/engine';

before(async () => {
  await loadModuleRuntimes();
});

test('every engine tool is registered, and nothing else under the tutor', () => {
  assert.deepEqual(listTools({ module: 'tutor' }).sort(), [...TUTOR_TOOL_NAMES].sort());
  for (const name of TUTOR_TOOL_NAMES) {
    const entry = getTool(name);
    assert.ok(entry?.handler, `${name} has a handler`);
    assert.deepEqual(entry?.definition, TUTOR_TOOLS[name]);
  }
});

test('cards are content tools, state tools are actions, and every round replays', () => {
  for (const name of TUTOR_TOOL_NAMES) {
    const metadata = getTool(name)?.metadata;
    assert.equal(metadata?.kind, TOOL_ENDS_TURN[name] ? 'content' : 'action', name);
    assert.equal(metadata?.replay, true, name);
    assert.equal(metadata?.logCategory, 'tutor', name);
  }
  assert.deepEqual(TUTOR_TOOL_NAMES.filter((name) => TOOL_ENDS_TURN[name]).sort(), [
    'ask_intake',
    'give_diagnostic',
    'give_quiz',
    'propose_plan',
  ]);
});

test('the six pre-engine tool names are gone', () => {
  for (const name of [
    'ask_student_question',
    'create_diagnostic',
    'learning_plan',
    'record_learning',
    'advance_topic',
    'quiz',
  ]) {
    assert.equal(getTool(name), undefined, name);
  }
});
