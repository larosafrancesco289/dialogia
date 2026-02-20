/**
 * Minimal Anthropic Messages API client for judge evaluation.
 * Converts ModelMessage[] to Anthropic format and maps the response
 * back to ChatCompletion so the ablation runner can use it unchanged.
 */

import type { ModelMessage } from '@/lib/transport/contracts';
import type { ChatCompletion } from '@/lib/transport/completions';

/** Map documented Anthropic aliases to concrete API model IDs (or stable alias IDs). */
const MODEL_ALIAS_MAP: Record<string, string> = {
  // Current models
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',

  // Legacy aliases
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-opus-4-1': 'claude-opus-4-1-20250805',
  'claude-sonnet-4-0': 'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-latest': 'claude-3-7-sonnet-latest',
  'claude-opus-4-0': 'claude-opus-4-20250514',
};

const SNAPSHOT_MODEL_ID_RE = /^claude-[a-z0-9-]+-\d{8}$/;
const MAX_EXPLICIT_CACHE_BREAKPOINTS = 4;
const AUTOMATIC_CACHE_CONTROL = { type: 'ephemeral' } as const;
const PROMPT_CACHING_MODEL_ID_RE_LIST = [
  /^claude-opus-4(?:-\d{8}|-[0-9](?:-\d{8})?)?$/,
  /^claude-sonnet-4(?:-\d{8}|-[0-9](?:-\d{8})?)?$/,
  /^claude-sonnet-3-7(?:-\d{8}|-latest)?$/,
  /^claude-3-7-sonnet(?:-\d{8}|-latest)?$/,
  /^claude-haiku-4-5(?:-\d{8})?$/,
  /^claude-haiku-3-5(?:-\d{8}|-latest)?$/,
  /^claude-3-5-haiku(?:-\d{8}|-latest)?$/,
  /^claude-haiku-3(?:-\d{8}|-latest)?$/,
  /^claude-3-haiku(?:-\d{8}|-latest)?$/,
  /^claude-opus-3(?:-\d{8}|-latest)?$/,
  /^claude-3-opus(?:-\d{8}|-latest)?$/,
] as const;

function normalizeModelSlug(model: string): string {
  let normalized = model.trim().toLowerCase();
  if (normalized.startsWith('anthropic/')) {
    normalized = normalized.slice('anthropic/'.length);
  }
  return normalized;
}

export function resolveAnthropicDirectModelId(model: string): string | undefined {
  const normalized = normalizeModelSlug(model);
  if (!normalized) return undefined;

  const mapped = MODEL_ALIAS_MAP[normalized];
  if (mapped) return mapped;

  const dottedVariant = normalized.replace(/\./g, '-');
  const mappedDotted = MODEL_ALIAS_MAP[dottedVariant];
  if (mappedDotted) return mappedDotted;

  if (SNAPSHOT_MODEL_ID_RE.test(normalized)) return normalized;
  if (SNAPSHOT_MODEL_ID_RE.test(dottedVariant)) return dottedVariant;

  return undefined;
}

function supportsAnthropicPromptCaching(model: string): boolean {
  const normalized = normalizeModelSlug(model).replace(/\./g, '-');
  return PROMPT_CACHING_MODEL_ID_RE_LIST.some((re) => re.test(normalized));
}

export async function anthropicChatCompletion({
  apiKey,
  model,
  messages,
  temperature = 0,
  maxTokens = 2048,
  enableAutomaticCaching = false,
}: {
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  enableAutomaticCaching?: boolean;
}): Promise<ChatCompletion> {
  // Split system message from the rest
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Build system content -- use content block array when cache_control is present
  // (for prompt caching), fall back to plain string for backwards compat.
  type SystemTextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
  const systemBlocks: SystemTextBlock[] = [];
  for (const msg of systemMessages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          systemBlocks.push(
            block.cache_control
              ? { type: 'text', text: block.text, cache_control: block.cache_control }
              : { type: 'text', text: block.text },
          );
        }
      }
    } else if (typeof msg.content === 'string' && msg.content) {
      systemBlocks.push({ type: 'text', text: msg.content });
    }
  }
  const hasCacheControl = systemBlocks.some((b) => b.cache_control != null);

  const toAnthropicMessageContent = (
    content: ModelMessage['content'],
  ): string | SystemTextBlock[] => {
    if (Array.isArray(content)) {
      if (content.length === 0) return '';

      const textBlocks = content.filter(
        (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text',
      );
      const hasOnlyTextBlocks = textBlocks.length === content.length;
      if (!hasOnlyTextBlocks) {
        // Fallback to string to avoid sending OpenAI-style blocks Anthropic doesn't accept.
        return JSON.stringify(content);
      }

      return textBlocks.map((block) =>
        block.cache_control
          ? { type: 'text', text: block.text, cache_control: block.cache_control }
          : { type: 'text', text: block.text },
      );
    }
    return typeof content === 'string' ? content : JSON.stringify(content);
  };

  const anthropicMessages = nonSystemMessages.map((m) => {
    return { role: m.role as 'user' | 'assistant', content: toAnthropicMessageContent(m.content) };
  });

  const explicitCacheBreakpoints =
    systemBlocks.reduce((count, block) => count + (block.cache_control ? 1 : 0), 0) +
    anthropicMessages.reduce((count, message) => {
      if (!Array.isArray(message.content)) return count;
      return (
        count +
        message.content.reduce(
          (messageCount, block) => messageCount + (block.cache_control ? 1 : 0),
          0,
        )
      );
    }, 0);

  const resolvedModel = resolveAnthropicDirectModelId(model);
  if (!resolvedModel) {
    throw new Error(`Unsupported Anthropic direct model alias: ${model}`);
  }

  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages: anthropicMessages,
    max_tokens: maxTokens,
    temperature,
  };
  if (systemBlocks.length > 0) {
    body.system = hasCacheControl ? systemBlocks : systemBlocks.map((b) => b.text).join('\n\n');
  }
  if (
    enableAutomaticCaching &&
    supportsAnthropicPromptCaching(resolvedModel) &&
    explicitCacheBreakpoints < MAX_EXPLICIT_CACHE_BREAKPOINTS
  ) {
    body.cache_control = AUTOMATIC_CACHE_CONTROL;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  // Map Anthropic response → ChatCompletion shape
  const textContent = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');

  return {
    id: data.id ?? '',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model ?? model,
    choices: [
      {
        index: 0,
        finish_reason: data.stop_reason === 'end_turn' ? 'stop' : (data.stop_reason ?? 'stop'),
        message: { role: 'assistant', content: textContent },
      },
    ],
    usage: {
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      prompt_tokens: data.usage?.input_tokens,
      completion_tokens: data.usage?.output_tokens,
    },
  };
}
