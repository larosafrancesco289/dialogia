// Module: services/memoryConsolidation
// Responsibility: One consolidation pass: ask the model new chats start with for a
// plan, apply it within the rules (`memory/consolidate`), and hand back the change
// with what Undo needs and the memory it planned from. Loaded on demand.

import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { requireModelAuth } from '@/lib/auth/require';
import { appLanguageForModel } from '@/lib/i18n/state';
import type { MemorySnapshot } from '@/lib/db/repository';
import {
  applyOperations,
  CONSOLIDATION_SYSTEM_PROMPT,
  consolidationModelId,
  consolidationRequest,
  readOperations,
  UNREADABLE_PLAN,
} from '@/lib/memory/consolidate';
import { stripThinkBlock } from '@/lib/openrouter/thinkTags';
import { guardZdrOrNotify } from '@/lib/policy/zdr/cache';
import { enforceZdrGate } from '@/lib/policy/runtime';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import { v4 as uuidv4 } from 'uuid';

const CONSOLIDATION_MAX_TOKENS = 8000;
const CONSOLIDATION_TIMEOUT_MS = 120_000;

/**
 * The plan for one pass, or undefined when zero data retention will not let
 * the model see memory (the guard has said why). Throws when there is no
 * answer, and with `UNREADABLE_PLAN` when the answer is no plan, including
 * one cut off before its end.
 */
/** The pass's "say" lines are read in the app, so they come in its language. */
function consolidationSystemPrompt(): string {
  const language = appLanguageForModel();
  return language
    ? `${CONSOLIDATION_SYSTEM_PROMPT}\n\nThe person's app is in ${language}: write every "say" in ${language}. Notes keep the language they are written in.`
    : CONSOLIDATION_SYSTEM_PROMPT;
}

export async function planConsolidation(
  set: StoreSetter,
  get: StoreGetter,
): Promise<(ReturnType<typeof applyOperations> & { before: MemorySnapshot }) | undefined> {
  const state = get();
  const before: MemorySnapshot = { folders: state.memory.folders, notes: state.memory.notes };
  const modelId = consolidationModelId(state);
  const auth = requireModelAuth(modelId, state.modelIndex);
  const allowed = await enforceZdrGate(state.ui, [modelId], (id) => guardZdrOrNotify(id, set, get));
  if (!allowed) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONSOLIDATION_TIMEOUT_MS);
  try {
    const response = await getChatCompletion()({
      auth,
      model: modelId,
      messages: [
        { role: 'system', content: consolidationSystemPrompt() },
        { role: 'user', content: consolidationRequest(before) },
      ],
      maxTokens: CONSOLIDATION_MAX_TOKENS,
      zdrOnly: state.ui.zdrOnly,
      signal: controller.signal,
    });
    const choice = response?.choices?.[0];
    const content = choice?.message?.content;
    const operations =
      choice?.finish_reason === 'length'
        ? undefined
        : readOperations(stripThinkBlock(typeof content === 'string' ? content : ''));
    if (!operations) {
      throw Object.assign(new Error('The consolidation plan could not be read.'), {
        code: UNREADABLE_PLAN,
      });
    }
    const plan = applyOperations({ memory: before, operations, now: Date.now(), newId: uuidv4 });
    return { ...plan, before };
  } finally {
    clearTimeout(timeout);
  }
}
