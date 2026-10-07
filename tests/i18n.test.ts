import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coreMessages, t } from '@/lib/i18n';
import { tutorMessages } from '@/modules/tutor/i18n';
import { LOCALES, matchLocale, resolveLanguage, type Locale } from '@/lib/i18n/locales';
import { getLocale, setLocale } from '@/lib/i18n/state';
import { formatList, formatPercent } from '@/lib/i18n/format';
import type { MessageSource, PluralMessage } from '@/lib/i18n/catalogue';

const CATALOGUES = { core: coreMessages, tutor: tutorMessages } as const;
const OTHERS = LOCALES.map((l) => l.code).filter((code) => code !== 'en') as Exclude<
  Locale,
  'en'
>[];

const placeholders = (value: string | PluralMessage): string[] => {
  const forms = typeof value === 'string' ? [value] : Object.values(value);
  const names = new Set<string>();
  for (const form of forms) {
    for (const match of (form ?? '').matchAll(/\{(\w+)\}/g)) names.add(match[1]);
  }
  return [...names].sort();
};

for (const [name, catalogue] of Object.entries(CATALOGUES)) {
  const source = catalogue.source as MessageSource;

  for (const locale of OTHERS) {
    test(`${name}: ${locale} has every English key, and only those`, async () => {
      const table = (await catalogue.load(locale)) as MessageSource;
      const missing = Object.keys(source).filter((key) => !(key in table));
      const extra = Object.keys(table).filter((key) => !(key in source));
      assert.deepEqual(missing, [], `missing in ${locale}`);
      assert.deepEqual(extra, [], `not in English`);
    });

    test(`${name}: ${locale} keeps each message's placeholders and its forms`, async () => {
      const table = (await catalogue.load(locale)) as MessageSource;
      const categories = new Set<string>(
        new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      );
      for (const [key, english] of Object.entries(source)) {
        const translated = table[key];
        if (translated === undefined) continue;
        assert.equal(typeof translated, typeof english, `${locale} ${key}: string or forms`);
        assert.deepEqual(placeholders(translated), placeholders(english), `${locale} ${key}`);
        if (typeof translated === 'string') {
          assert.ok(translated.trim(), `${locale} ${key} is empty`);
          continue;
        }
        assert.ok(translated.other, `${locale} ${key} has no "other" form`);
        for (const form of Object.keys(translated)) {
          assert.ok(categories.has(form), `${locale} ${key}: "${form}" is not a ${locale} form`);
        }
      }
    });
  }
}

test('a citation is known by the words before its title, in every language', async () => {
  for (const locale of OTHERS) {
    const table = (await coreMessages.load(locale)) as MessageSource;
    assert.match(String(table['sources.citation']), /\{title\}$/, locale);
  }
});

test('Auto reads the browser’s languages, falling back to English', () => {
  assert.equal(matchLocale(['it-IT', 'en-US']), 'it');
  assert.equal(matchLocale(['de-AT']), 'de');
  assert.equal(matchLocale(['pt-PT']), 'pt-BR');
  assert.equal(matchLocale(['pt-BR']), 'pt-BR');
  assert.equal(matchLocale(['el']), 'el');
  assert.equal(matchLocale(['ja', 'nl']), 'en');
  assert.equal(matchLocale([]), 'en');
  assert.equal(resolveLanguage('auto', ['fr-CA']), 'fr');
  assert.equal(resolveLanguage('es', ['fr-CA']), 'es');
});

test('a message fills its placeholders and picks its form by number', async () => {
  assert.equal(t('folder.count', { count: 1 }), '1 chat');
  assert.equal(t('folder.count', { count: 3 }), '3 chats');
  assert.equal(t('sidebar.noMatch', { query: 'x' }), 'No chats match “x”.');
  try {
    await setLocale('it');
    assert.equal(getLocale(), 'it');
    assert.equal(t('folder.count', { count: 1 }), '1 chat');
    assert.notEqual(t('sidebar.newChat'), 'New chat');
    assert.equal(formatPercent(0.42).replace(/\s/g, ' '), '42%');
    assert.equal(formatList(['a', 'b', 'c']), 'a, b e c');
    await setLocale('de');
    assert.equal(formatPercent(0.42).replace(/\s/g, ' '), '42 %');
    await setLocale('el');
    assert.equal(formatList(['α', 'β']), 'α και β');
  } finally {
    await setLocale('en');
  }
  // English keeps its own lists, without the serial comma.
  assert.equal(formatList(['a', 'b', 'c']), 'a, b and c');
});
