// Module: services/titleGenerator
// Responsibility: Generate chat titles using LLM (fire-and-forget, silent failure)

import type { ModelMessage } from '@/lib/agent/types';
import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { logger } from '@/lib/logger';
import type { AccessTier } from '@/lib/auth/types';

const TITLE_MODEL = 'openai/gpt-oss-20b';
const TITLE_MAX_TOKENS = 150; // Needs extra tokens for reasoning models
const TITLE_TIMEOUT_MS = 15_000;

const TITLE_SYSTEM_PROMPT = `You are a chat title generator. Given the user's first message, generate a short, descriptive title (3-6 words max). Return ONLY the title text, no quotes, no punctuation at the end, no explanation.`;

/**
 * Get the current access tier from cookies.
 * Returns 'free' if no tier cookie is present.
 */
function getClientTier(): AccessTier {
  const tierCookie = getCookie(TIER_COOKIE_NAME);
  if (tierCookie === 'developer' || tierCookie === 'individual' || tierCookie === 'study') {
    return tierCookie;
  }
  return 'free';
}

/**
 * Generate a chat title from the first user message.
 * Returns null on any failure (timeout, API error, invalid response).
 * Designed to be called fire-and-forget style.
 */
export async function generateChatTitle(userMessage: string): Promise<string | null> {
  console.log('[titleGenerator] Starting title generation for:', userMessage.slice(0, 50));

  if (!userMessage.trim()) {
    console.log('[titleGenerator] Empty message, skipping');
    return null;
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage.slice(0, 500) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

  try {
    console.log('[titleGenerator] Calling getChatCompletion with model:', TITLE_MODEL);
    const response = await getChatCompletion()({
      apiKey: '',
      transport: 'openrouter',
      model: TITLE_MODEL,
      messages,
      max_tokens: TITLE_MAX_TOKENS,
      temperature: 0.7,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('[titleGenerator] Got response:', response);

    const content = response?.choices?.[0]?.message?.content;
    const title = (typeof content === 'string' ? content : '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 60);

    console.log('[titleGenerator] Generated title:', title);
    return title || null;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[titleGenerator] Failed to generate title:', error);
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
) {
  // Skip title generation for free tier - feature only available for paid tiers
  const tier = getClientTier();
  if (tier === 'free') {
    console.log('[titleGenerator] Skipping title generation for free tier');
    return;
  }

  console.log('[titleGenerator] triggerAsyncTitleGeneration called for chat:', chatId, 'tier:', tier);
  generateChatTitle(userMessage)
    .then((title) => {
      console.log('[titleGenerator] Title generation complete, title:', title);
      if (title) {
        return renameChat(chatId, title);
      }
    })
    .catch((error) => {
      console.error('[titleGenerator] Async title generation error:', error);
    });
}
