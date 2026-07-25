// Module: services/titleGenerator
// Responsibility: Generate chat titles using LLM (fire-and-forget, silent failure)

import type { ModelMessage } from '@/lib/agent/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { requireEndpointAuth } from '@/lib/auth/require';
import type { TransportAuth } from '@/lib/auth/transport';
import { getClientTier } from '@/lib/auth/tier.client';
import type { AccessTier } from '@/lib/auth/types';
import { logger } from '@/lib/logger';
import {
  ANTHROPIC_ENDPOINT_ID,
  OPENROUTER_ENDPOINT_ID,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { getDefaultEndpoint } from '@/lib/transport/endpointRegistry';

/** Cheap, fast models the built-in endpoints are known to serve. */
const BUILT_IN_TITLE_MODELS: Record<string, string> = {
  [OPENROUTER_ENDPOINT_ID]: 'openai/gpt-oss-20b',
  [ANTHROPIC_ENDPOINT_ID]: 'anthropic-direct/claude-haiku-4-5',
};

const TITLE_MAX_TOKENS = 150; // Needs extra tokens for reasoning models
const TITLE_TIMEOUT_MS = 15_000;

const TITLE_SYSTEM_PROMPT = `You are a chat title generator. Given the user's first message, generate a short, descriptive title (3-6 words max). Return ONLY the title text, no quotes, no punctuation at the end, no explanation.`;

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
      temperature: 0.7,
      zdrOnly,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const content = response?.choices?.[0]?.message?.content;
    const title = (typeof content === 'string' ? content : '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 60);

    return title || null;
  } catch (error) {
    clearTimeout(timeoutId);
    logger.error('[titleGenerator] Failed to generate title', error);
    return null;
  }
}

/**
 * Fire-and-forget title generation.
 * Generates title asynchronously and updates chat when ready.
 * Silently fails without any user notification.
 */
export function triggerAsyncTitleGeneration(
  chatId: string,
  userMessage: string,
  renameChat: (id: string, title: string) => Promise<void>,
  tier?: AccessTier,
  endpoint?: ProviderEndpoint,
  zdrOnly = false,
  chatModelId?: string,
) {
  // Skip title generation for free tier - feature only available for paid tiers
  const resolvedTier = tier ?? getClientTier();
  if (resolvedTier === 'free') {
    return;
  }

  generateChatTitle(userMessage, endpoint ?? getDefaultEndpoint(), chatModelId, zdrOnly)
    .then((title) => {
      if (title) {
        return renameChat(chatId, title);
      }
    })
    .catch((error) => {
      logger.error('[titleGenerator] Async title generation error', error);
    });
}
