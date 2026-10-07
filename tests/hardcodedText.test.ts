import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

// Words on screen come from a catalogue (`useT`), so the app can be read in
// every language it offers. This finds words written straight into JSX: text
// between tags, and the attributes a person reads or hears (labels, titles,
// placeholders). A string that is not words, or is a name, belongs below.

const ROOTS = ['src/components', 'src/modules'];

const READ_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
  'label',
  'ariaLabel',
  'description',
  'confirmLabel',
  'cancelLabel',
  'closeLabel',
  'lead',
  'hint',
]);

/** Not words to translate: the brand, provider key and address examples. */
const ALLOWED = new Set(['Dialogia', 'sk-or-…', 'sk-ant-…', 'tvly-…', 'qwen3:8b, llama3.2']);

const hasWords = (text: string) => /\p{L}{2,}/u.test(text) && !ALLOWED.has(text.trim());

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tooling' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });
}

/** The literal text of an attribute's value, when it is one: "x", {'x'} or {`x`}. */
function literalValue(initializer: ts.JsxAttributeValue | undefined): string | undefined {
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    // The words around the substitutions: `Remove ${name}` has "Remove ".
    return [expression.head.text, ...expression.templateSpans.map((s) => s.literal.text)].join(' ');
  }
  return undefined;
}

/** Each piece of hard-coded text in a file, as "line: text". */
function hardcodedText(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const where = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      found.push(`${where(node)}: ${node.text.trim()}`);
    }
    if (ts.isJsxAttribute(node) && READ_ATTRIBUTES.has(node.name.getText(source))) {
      const value = literalValue(node.initializer);
      if (value !== undefined && hasWords(value)) {
        found.push(`${where(node)}: ${node.name.getText(source)}="${value.trim()}"`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const parse = (path: string, text: string) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('no words are written straight into JSX: they come from a catalogue', () => {
  const offenders = ROOTS.flatMap((root) =>
    tsxFiles(root).flatMap((path) =>
      hardcodedText(parse(path, readFileSync(path, 'utf8'))).map(
        (hit) => `${relative(process.cwd(), path)}:${hit}`,
      ),
    ),
  );
  assert.deepEqual(offenders, [], 'add these to src/lib/i18n/messages/en.ts and use t()');
});

test('the scanner catches words, and leaves translated text and names alone', () => {
  const snippet = parse(
    'snippet.tsx',
    `const a = <button aria-label="Close" title={\`Remove \${x}\`}>Save it</button>;
const b = <span title={t('ok')}>{t('ok')}</span>;
const c = <b>Dialogia</b>;`,
  );
  assert.deepEqual(hardcodedText(snippet), [
    '1: aria-label="Close"',
    '1: title="Remove"',
    '1: Save it',
  ]);
});
