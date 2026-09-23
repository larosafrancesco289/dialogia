// Module: services/titleGenerator
// Responsibility: Generate chat titles using LLM (fire-and-forget, silent failure)

import type { ModelMessage } from '@/lib/agent/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { requireEndpointAuth } from '@/lib/auth/require';
import type { TransportAuth } from '@/lib/auth/transport';
import { logger } from '@/lib/logger';
import {
  ANTHROPIC_ENDPOINT_ID,
  OPENROUTER_ENDPOINT_ID,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { getDefaultEndpoint } from '@/lib/transport/endpointRegistry';

/** Cheap, fast models the built-in endpoints are known to serve. */
const BUILT_IN_TITLE_MODELS: Record<string, string> = {
  [OPENROUTER_ENDPOINT_ID]: 'openai/gpt-6-luna',
  [ANTHROPIC_ENDPOINT_ID]: 'anthropic-direct/claude-haiku-4-5',
};

const TITLE_MAX_TOKENS = 150;
const TITLE_TIMEOUT_MS = 15_000;

const TITLE_MAX_CHARS = 60;

/** Cut at a word boundary so a long title never ends mid-word. */
function clampTitle(text: string): string {
  if (text.length <= TITLE_MAX_CHARS) return text;
  const cut = text.slice(0, TITLE_MAX_CHARS + 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 20 ? cut.slice(0, boundary) : cut.slice(0, TITLE_MAX_CHARS)).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/**
 * The title a chat gets when no model names it (titling off, a failed call,
 * an empty reply): the start of the first message, as the person wrote it.
 */
export function fallbackChatTitle(userMessage: string): string | null {
  const firstLine = userMessage
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s]+/, '').trim())
    .find(Boolean);
  if (!firstLine) return null;
  const plain = firstLine.replace(/[*_`~]+/g, '').replace(/\s+/g, ' ');
  return clampTitle(plain.charAt(0).toUpperCase() + plain.slice(1)) || null;
}

const TITLE_SYSTEM_PROMPT = `You write titles for chats. Given the user's first message, reply with a short title of 3-6 words. Use sentence case: capitalize only the first word and proper nouns, as in "Planning a week in Lisbon" or "How vaccines train the immune system". Reply with the title only: no quotes, no final punctuation.`;

/**
 * Which model titles this chat. A user-configured endpoint has no known cheap
 * model, so it falls back to the chat's own model unless the user named one —
 * or turned titling off for that endpoint entirely.
 */
export function resolveTitleModelId(
  endpoint: ProviderEndpoint,
  chatModelId?: string,
): string | undefined {
  if (endpoint.disableTitleGeneration) return undefined;
  if (endpoint.titleModelId) return endpoint.titleModelId;
  return BUILT_IN_TITLE_MODELS[endpoint.id] ?? chatModelId;
}

/**
 * Generate a chat title from the first user message.
 * Returns null on any failure (timeout, API error, invalid response).
 * Designed to be called fire-and-forget style.
 */
export async function generateChatTitle(
  userMessage: string,
  endpoint: ProviderEndpoint = getDefaultEndpoint(),
  chatModelId?: string,
  zdrOnly = false,
): Promise<string | null> {
  if (!userMessage.trim()) {
    return null;
  }

  const model = resolveTitleModelId(endpoint, chatModelId);
  if (!model) return null;

  // A built-in title model is known to title well without thinking, which is
  // twice as fast and cannot spend the whole budget before writing a word. A
  // user's own model may require reasoning, so it keeps its default.
  const disableReasoning = model === BUILT_IN_TITLE_MODELS[endpoint.id];

  const messages: ModelMessage[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage.slice(0, 500) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

  try {
    let auth: TransportAuth;
    try {
      auth = requireEndpointAuth(endpoint);
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
    const response = await getChatCompletion()({
      auth,
      model,
      messages,
      maxTokens: TITLE_MAX_TOKENS,
      disableReasoning,
      zdrOnly,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const content = response?.choices?.[0]?.message?.content;
    const title = clampTitle(
      (typeof content === 'string' ? content : '').trim().replace(/^["']|["']$/g, ''),
    );

    return title || null;
  } catch (error) {
    clearTimeout(timeoutId);
    logger.error('[titleGenerator] Failed to generate title', error);
    return null;
  }
}

/**
 * Fire-and-forget title generation.
 * Generates title asynchronously and updates chat when ready. When no model
 * title arrives, the chat is named after its first message instead, so it
 * never stays "New chat". Failures are logged, never shown.
 */
export function triggerAsyncTitleGeneration(
  chatId: string,
  userMessage: string,
  renameChat: (id: string, title: string) => Promise<void>,
  endpoint?: ProviderEndpoint,
  zdrOnly = false,
  chatModelId?: string,
) {
  generateChatTitle(userMessage, endpoint ?? getDefaultEndpoint(), chatModelId, zdrOnly)
    .catch((error) => {
      logger.error('[titleGenerator] Async title generation error', error);
      return null;
    })
    .then((title) => {
      const next = title ?? fallbackChatTitle(userMessage);
      if (next) return renameChat(chatId, next);
    })
    .catch((error) => {
      logger.error('[titleGenerator] Failed to apply title', error);
    });
}
