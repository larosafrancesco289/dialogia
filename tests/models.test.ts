import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getModelCapabilities } from '@/lib/models';

// capabilities.test.ts covers each detector; this pins that every flag is wired through.
test('getModelCapabilities reports every capability the metadata claims', () => {
  const caps = getModelCapabilities({
    id: 'provider/model',
    raw: {
      supported_parameters: ['reasoning', 'tools'],
      modalities: ['text', 'vision'],
      input_modalities: ['text', 'audio'],
      output_modalities: ['text', 'image'],
    },
  });
  assert.deepEqual(caps, { canReason: true, canSee: true, canAudio: true, canImageOut: true });
});
