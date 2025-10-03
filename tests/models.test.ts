import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ORModel } from '@/lib/types';
import {
  isReasoningSupported,
  isToolCallingSupported,
  isVisionSupported,
  isAudioInputSupported,
  isImageOutputSupported,
  getModelCapabilities,
} from '@/lib/models';

const baseModel = (overrides: Partial<ORModel> & { raw?: any } = {}): ORModel => ({
  id: 'provider/model',
  name: 'Provider Model',
  context_length: 8000,
  pricing: { prompt: 1, completion: 2, currency: 'usd' },
  raw: {},
  ...overrides,
});

test('reasoning support detected from supported_parameters', () => {
  const model = baseModel({ raw: { supported_parameters: ['reasoning', 'tools'] } });
  assert.equal(isReasoningSupported(model), true);
  assert.equal(isToolCallingSupported(model), true);
});

test('vision and audio detection falls back to metadata hints', () => {
  const model = baseModel({
    id: 'provider/multimodal-vision',
    raw: {
      modalities: ['text', 'vision'],
      input_modalities: ['text', 'image', 'audio'],
      architecture: { modality: 'multimodal' },
    },
  });
  assert.equal(isVisionSupported(model), true);
  assert.equal(isAudioInputSupported(model), true);
});

test('image output support reads output_modalities', () => {
  const model = baseModel({ raw: { output_modalities: ['text', 'image'] } });
  assert.equal(isImageOutputSupported(model), true);
});

test('getModelCapabilities aggregates individual checks', () => {
  const model = baseModel({
    raw: {
      supported_parameters: ['reasoning', 'tools'],
      modalities: ['text', 'vision'],
      input_modalities: ['text', 'audio'],
      output_modalities: ['text', 'image'],
    },
  });
  const caps = getModelCapabilities(model);
  assert.deepEqual(caps, {
    canReason: true,
    canSee: true,
    canAudio: true,
    canImageOut: true,
  });
});
