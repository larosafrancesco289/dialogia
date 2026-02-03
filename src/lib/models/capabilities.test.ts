import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelCapabilities,
  isAudioInputSupported,
  isImageOutputSupported,
  isReasoningSupported,
  isToolCallingSupported,
  isVisionSupported,
} from '@/lib/models';
import type { ModelDescriptor } from '@/lib/types';

const RAW_SAMPLES = {
  supportedParams: {
    supported_parameters: ['reasoning', 'tools'],
  },
  visionModalities: {
    modalities: ['text', 'image'],
    input_modalities: ['text', 'image'],
  },
  audioMultiModal: {
    modality: 'multi',
    input_modalities: ['text', 'audio'],
  },
  imageOutput: {
    output_modalities: ['image'],
  },
} as const;

const buildModel = (id: string, raw: unknown, name?: string): ModelDescriptor => ({
  id,
  name,
  raw,
});

test('capability inference honors supported_parameters', () => {
  const model = buildModel('provider/reasoning-tools', RAW_SAMPLES.supportedParams);
  assert.equal(isReasoningSupported(model), true);
  assert.equal(isToolCallingSupported(model), true);

  const caps = getModelCapabilities(model);
  assert.equal(caps.canReason, true);
  assert.equal(caps.canSee, false);
  assert.equal(caps.canAudio, false);
  assert.equal(caps.canImageOut, false);
});

test('capability inference uses modality hints for vision and audio', () => {
  const visionModel = buildModel('provider/vision-model', RAW_SAMPLES.visionModalities);
  assert.equal(isVisionSupported(visionModel), true);

  const audioModel = buildModel('provider/gpt-4o', RAW_SAMPLES.audioMultiModal, 'GPT-4o');
  assert.equal(isAudioInputSupported(audioModel), true);
});

test('capability inference reads output modalities for image generation', () => {
  const imageModel = buildModel('provider/image-gen', RAW_SAMPLES.imageOutput);
  assert.equal(isImageOutputSupported(imageModel), true);
});
