import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPOSER_FIELD_SELECTOR } from '@/lib/ui/focus';

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

test('choosing a model from Try again sends focus to the composer', () => {
  assert.match(read('src/components/RegenerateMenu.tsx'), /focusComposer\(\)/);
});
