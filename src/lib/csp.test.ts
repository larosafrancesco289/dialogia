import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy, headersFile, inlineScripts } from '@/lib/csp';

test('the policy loads images and scripts from this origin alone, and the header refuses framing', () => {
  const policy = contentSecurityPolicy(['abc=']);
  assert.match(policy, /img-src 'self' data: blob:(;|$)/);
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval' 'sha256-abc='(;|$)/);
  assert.doesNotMatch(policy, /unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/);
  assert.match(headersFile(['abc=']), /frame-ancestors 'none'/);
  assert.match(headersFile(['abc=']), /X-Content-Type-Options: nosniff/);
  assert.doesNotMatch(contentSecurityPolicy([], { meta: true }), /frame-ancestors/);
});

test('inline scripts are found by body, and scripts with a src are not', () => {
  const html =
    '<head><script>(() => 1)();</script><script type="module" src="/a.js"></script><script id="x" src="/r.js"></script></head>';
  assert.deepEqual(inlineScripts(html), ['(() => 1)();']);
});
