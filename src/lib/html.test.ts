import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMainText } from './html';

test('extractMainText pulls title, description, headings, and text with entity decoding', () => {
  const html = `<!doctype html>
    <html>
      <head>
        <title>Sample &amp; Article</title>
        <meta name="description" content="A short &quot;summary&quot;" />
      </head>
      <body>
        <main>
          <h1>Welcome&nbsp;Home</h1>
          <article>
            <h2>Highlights</h2>
            <p>The first paragraph.</p>
            <p>More <strong>details</strong> follow.</p>
          </article>
        </main>
      </body>
    </html>`;
  const summary = extractMainText(html);
  assert.equal(summary.title, 'Sample & Article');
  assert.equal(summary.description, 'A short "summary"');
  assert.ok(summary.text.includes('The first paragraph.'));
  assert.ok(summary.text.length > 0);
  assert.deepEqual(summary.headings, ['Welcome Home', 'Highlights']);
});

test('extractMainText falls back to body content and limits heading count', () => {
  const headings = Array.from({ length: 20 }, (_, i) => `<h2>Heading ${i}</h2>`).join('');
  const html = `<body>${headings}<p>Content goes here.</p></body>`;
  const summary = extractMainText(html);
  assert.equal(summary.text.includes('Content goes here.'), true);
  assert.ok(summary.headings);
  assert.equal(summary.headings?.length, 12);
});
