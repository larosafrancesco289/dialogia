// Module: services/titleGenerator
// Responsibility: Generate chat titles using LLM (fire-and-forget, silent failure)

import type { ModelMessage } from '@/lib/agent/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { requireTransportAuth } from '@/lib/auth/require';
import type { TransportAuth } from '@/lib/auth/transport';
import { getClientTier } from '@/lib/auth/tier.client';
import type { AccessTier } from '@/lib/auth/types';
import { logger } from '@/lib/logger';

const TITLE_MODEL = 'openai/gpt-oss-20b';
const TITLE_MAX_TOKENS = 150; // Needs extra tokens for reasoning models
const TITLE_TIMEOUT_MS = 15_000;

const TITLE_SYSTEM_PROMPT = `You are a chat title generator. Given the user's first message, generate a short, descriptive title (3-6 words max). Return ONLY the title text, no quotes, no punctuation at the end, no explanation.`;

/**
 * Generate a chat title from the first user message.
 * Returns null on any failure (timeout, API error, invalid response).
 * Designed to be called fire-and-forget style.
 */
export async function generateChatTitle(userMessage: string): Promise<string | null> {
  if (!userMessage.trim()) {
    return null;
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage.slice(0, 500) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

  try {
    let auth: TransportAuth;
    try {
      auth = requireTransportAuth('openrouter');
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
    const response = await getChatCompletion()({
      auth,
      model: TITLE_MODEL,
      messages,
      maxTokens: TITLE_MAX_TOKENS,
      temperature: 0.7,
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
) {
  // Skip title generation for free tier - feature only available for paid tiers
  const resolvedTier = tier ?? getClientTier();
  if (resolvedTier === 'free') {
    return;
  }

  generateChatTitle(userMessage)
    .then((title) => {
      if (title) {
        return renameChat(chatId, title);
      }
    })
    .catch((error) => {
      logger.error('[titleGenerator] Async title generation error', error);
    });
}
