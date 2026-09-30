// Module: services/memoryConsolidation
// Responsibility: One consolidation pass: ask the model new chats start with for a
// plan, apply it within the rules (`memory/consolidate`), and hand back the change
// with memory as it was, so the whole pass can be taken back. Loaded on demand.

import { getChatCompletion } from '@/lib/agent/pipelineClient';
import { requireModelAuth } from '@/lib/auth/require';
import type { MemoryChange, MemorySnapshot } from '@/lib/db/repository';
import {
  applyOperations,
  CONSOLIDATION_SYSTEM_PROMPT,
  consolidationRequest,
  readOperations,
} from '@/lib/memory/consolidate';
import { stripThinkBlock } from '@/lib/openrouter/thinkTags';
import { ChatService } from '@/lib/services/chatService';
import type { StoreGetter } from '@/lib/store/types';
import { v4 as uuidv4 } from 'uuid';

const CONSOLIDATION_MAX_TOKENS = 8000;
const CONSOLIDATION_TIMEOUT_MS = 120_000;

export async function planConsolidation(get: StoreGetter): Promise<{
  change: MemoryChange;
  lines: string[];
  before: MemorySnapshot;
}> {
  const state = get();
  const before: MemorySnapshot = { folders: state.memory.folders, notes: state.memory.notes };
  const { modelId } = ChatService.buildSettingsForNewChat({
    ui: state.ui,
    chats: state.chats,
    selectedChatId: state.selectedChatId,
    models: state.models,
  });
  const auth = requireModelAuth(modelId, state.modelIndex);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONSOLIDATION_TIMEOUT_MS);
  try {
    const response = await getChatCompletion()({
      auth,
      model: modelId,
      messages: [
        { role: 'system', content: CONSOLIDATION_SYSTEM_PROMPT },
        { role: 'user', content: consolidationRequest(before) },
      ],
      maxTokens: CONSOLIDATION_MAX_TOKENS,
      zdrOnly: state.ui.zdrOnly,
      signal: controller.signal,
    });
    const content = response?.choices?.[0]?.message?.content;
    const operations = readOperations(stripThinkBlock(typeof content === 'string' ? content : ''));
    const { change, lines } = applyOperations({
      memory: before,
      operations,
      now: Date.now(),
      newId: uuidv4,
    });
    return { change, lines, before };
  } finally {
    clearTimeout(timeout);
  }
}
