import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayerStack, indexForKey, trapTarget, COMPOSER_FIELD_SELECTOR } from '@/lib/ui/focus';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const items = ['close', 'back', 'next'];

test('a trapped Tab wraps from the last stop to the first, and back', () => {
  assert.equal(trapTarget(items, 'next', false, true), 'close');
  assert.equal(trapTarget(items, 'close', true, true), 'next');
});

test('a trapped Tab in the middle is left to the browser', () => {
  assert.equal(trapTarget(items, 'close', false, true), null);
  assert.equal(trapTarget(items, 'back', true, true), null);
});

test('Tab from outside the trap comes back in at the near end', () => {
  assert.equal(trapTarget(items, 'page-behind', false, false), 'close');
  assert.equal(trapTarget(items, 'page-behind', true, false), 'next');
  assert.equal(trapTarget(items, null, false, false), 'close');
});

test('Tab from the container itself enters at the near end', () => {
  assert.equal(trapTarget(items, 'dialog', false, true), 'close');
  assert.equal(trapTarget(items, 'dialog', true, true), 'next');
});

test('a trap with nothing to tab to keeps focus on the container', () => {
  assert.equal(trapTarget([], 'dialog', false, true), 'container');
  assert.equal(trapTarget([], null, true, false), 'container');
});

test('menu arrows move one item and wrap at the ends', () => {
  assert.equal(indexForKey('ArrowDown', 0, 3), 1);
  assert.equal(indexForKey('ArrowDown', 2, 3), 0);
  assert.equal(indexForKey('ArrowUp', 0, 3), 2);
  assert.equal(indexForKey('ArrowUp', 2, 3), 1);
  assert.equal(indexForKey('Home', 2, 3), 0);
  assert.equal(indexForKey('End', 0, 3), 2);
});

test('menu arrows start from the ends when no item has focus', () => {
  assert.equal(indexForKey('ArrowDown', -1, 3), 0);
  assert.equal(indexForKey('ArrowUp', -1, 3), 2);
});

test('a menu ignores sideways arrows; a radio group takes them', () => {
  assert.equal(indexForKey('ArrowRight', 0, 3), null);
  assert.equal(indexForKey('ArrowRight', 0, 3, 'both'), 1);
  assert.equal(indexForKey('ArrowLeft', 0, 3, 'both'), 2);
  assert.equal(indexForKey('Enter', 0, 3, 'both'), null);
  assert.equal(indexForKey('ArrowDown', 0, 0), null);
});

test('only the layer opened last is on top, however they close', () => {
  const stack = createLayerStack<string>();
  const releaseSettings = stack.push('settings');
  const releaseConfirm = stack.push('confirm');
  assert.equal(stack.top(), 'confirm');

  releaseConfirm();
  assert.equal(stack.top(), 'settings');

  const releaseSheet = stack.push('sheet');
  releaseSettings();
  assert.equal(stack.top(), 'sheet');
  assert.equal(stack.size(), 1);

  releaseSheet();
  releaseSheet();
  assert.equal(stack.top(), undefined);
  assert.equal(stack.size(), 0);
});

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

// Focus that would fall to <body> (the Try again menu's footer unmounting as
// the new reply starts) goes to the composer by this selector; there is no DOM
// in the tests, so the contract is checked on the source.
test('the composer field carries the class focus is sent to', () => {
  const [tag, className] = COMPOSER_FIELD_SELECTOR.split('.');
  const input = read('src/components/composer/ComposerInput.tsx');
  const element = input.slice(input.indexOf(`<${tag}`));
  assert.match(element, new RegExp(`className="${className}\\b`));
});
