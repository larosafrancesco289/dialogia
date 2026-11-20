import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_PRESETS } from '@/lib/openaiCompat/presets';
import { isValidBaseUrl, normalizeBaseUrl, slugifyEndpointId } from '@/lib/transport/endpoints';

test('every server preset carries a valid, normalized http(s) base URL and unique id', () => {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const preset of SERVER_PRESETS) {
    assert.ok(preset.label.trim().length > 0);
    assert.equal(isValidBaseUrl(preset.baseUrl), true, `${preset.id} has a valid URL`);
    assert.equal(preset.baseUrl, normalizeBaseUrl(preset.baseUrl), 'no trailing slash');
    assert.equal(ids.has(preset.id), false, `unique id ${preset.id}`);
    ids.add(preset.id);
    const slug = slugifyEndpointId(preset.label);
    assert.equal(slugs.has(slug), false, `unique slug ${slug}`);
    slugs.add(slug);
  }
});
