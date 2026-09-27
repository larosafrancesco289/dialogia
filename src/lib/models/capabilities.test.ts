import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelCapabilities,
  isAudioInputSupported,
  isImageOutputSupported,
  isReasoningSupported,
  isToolCallingSupported,
  isVisionSupported,
  getSelectableReasoningEfforts,
  repliesInText,
} from '@/lib/models';
import type { ModelDescriptor } from '@/lib/types';

const supportsXhigh = (model: ModelDescriptor) =>
  getSelectableReasoningEfforts(model).includes('xhigh');

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

test('an image generator is not offered to redo a text reply, even one that also writes text', () => {
  const arch = (output_modalities: string[]) => ({ architecture: { output_modalities } });
  assert.equal(repliesInText(buildModel('openai/gpt-5.4', arch(['text']))), true);
  assert.equal(
    repliesInText(buildModel('openai/gpt-5.4-image-2', arch(['image', 'text']), 'GPT-5.4 Image 2')),
    false,
  );
  assert.equal(repliesInText(buildModel('provider/image-gen', RAW_SAMPLES.imageOutput)), false);
  // Seeing images is not making them.
  assert.equal(repliesInText(buildModel('provider/vision', RAW_SAMPLES.visionModalities)), true);
  // Nothing declared: the name decides, and an unknown model stays.
  assert.equal(repliesInText(buildModel('local/llama', {})), true);
  assert.equal(repliesInText(buildModel('local/stable-diffusion', {})), false);
  assert.equal(repliesInText(undefined), true);
});

test('xhigh is selectable for known model families known model families', () => {
  const reasoningRaw = { supported_parameters: ['reasoning'] };

  assert.equal(supportsXhigh(buildModel('anthropic-direct/claude-fable-5', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('anthropic/claude-fable-5', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('anthropic-direct/claude-opus-4-7', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('anthropic/claude-opus-4-7', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('anthropic-direct/claude-opus-4-8', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('anthropic/claude-opus-4.8', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('openai/gpt-5.4', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('openai/gpt-5-4', reasoningRaw)), true);
  assert.equal(supportsXhigh(buildModel('openai/gpt-5.2', reasoningRaw)), true);

  assert.equal(supportsXhigh(buildModel('openai/gpt-5', reasoningRaw)), false);
  assert.equal(supportsXhigh(buildModel('anthropic/claude-opus-4-6', reasoningRaw)), false);
  // Non-reasoning model short-circuits regardless of id
  assert.equal(supportsXhigh(buildModel('openai/gpt-5.4', { supported_parameters: [] })), false);
});

test('xhigh selectability honors metadata hint', () => {
  const model = buildModel('provider/experimental-reasoner', {
    supported_parameters: ['reasoning', 'reasoning_effort_xhigh'],
  });
  assert.equal(supportsXhigh(model), true);
});
