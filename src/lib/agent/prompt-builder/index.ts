import type {
  Chat,
  MemoryFolder,
  MemoryNote,
  Message,
  MessageToolRound,
  ModelDescriptor,
  PersistedAttachment,
} from '@/lib/types';
import type { ModelMessage } from '@/lib/agent/types';
import { TokenBudgeter } from './TokenBudgeter';
import { createToolCallIdAllocator, replayAssistantTurn } from './replay';
import { AttachmentProcessor, type AttachmentReplay } from '@/lib/attachments/prompt';
import { getModelCapabilities } from '@/lib/models/capabilities';
import { formatMessageTimestamp } from '@/lib/agent/prompts/timestamps';
import { estimateTokens } from '@/lib/tokenEstimate';
import { memoryWriteRound } from '@/lib/memory/writes';

/**
 * How many of the latest messages that carry files (images, recordings, PDFs
 * sent as files) send them in full; earlier ones name each file in a line. Two
 * keep the person's latest pictures in view through any number of follow-up
 * questions, while a long chat stops paying for every file again each turn.
 */
const MESSAGES_WITH_FILES_IN_FULL = 2;

export function buildChatCompletionMessages(params: {
  chat: Chat;
  priorMessages: Message[];
  models: ModelDescriptor[];
  newUserContent?: string;
  newUserAttachments?: PersistedAttachment[];
  timestamps?: boolean;
  /** Memory, when this turn offers its tools: each reply's writes replay as its calls. */
  replayMemoryWrites?: { folders: MemoryFolder[]; notes: MemoryNote[] };
  /**
   * What the model can take in, so an earlier image or recording it cannot is
   * a line naming it; read from the model's own listing when not given.
   */
  inputs?: { canSee: boolean; canAudio: boolean };
}): ModelMessage[] {
  const { chat, priorMessages, models, newUserContent, newUserAttachments, timestamps } = params;
  const modelInfo = models.find((m) => m.id === chat.settings.modelId);
  const contextLimit = modelInfo?.context_length ?? 8000;
  const { canSee, canAudio } = params.inputs ?? getModelCapabilities(modelInfo);
  const reserved =
    typeof chat.settings.generation.maxTokens === 'number'
      ? chat.settings.generation.maxTokens
      : 1024;

  // 1. Normalize History
  const history: {
    role: 'user' | 'assistant';
    content: string;
    createdAt?: number;
    attachments?: PersistedAttachment[];
    /** How the attachments go: set once it is known which messages send their files in full. */
    replay?: AttachmentReplay;
    annotations?: Message['annotations'];
    /** Replayed as real tool calls; budgeted with the message, never apart from it. */
    toolRounds?: MessageToolRound[];
    extraTokens?: number;
  }[] = [];

  for (const m of priorMessages) {
    if (m.role === 'system') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const base = typeof m.content === 'string' ? m.content : '';
    const hidden = m.hiddenContent;
    const combined =
      m.role === 'assistant'
        ? [base, typeof hidden === 'string' ? hidden : ''].filter((x) => x && x.trim()).join('\n\n')
        : base;
    const memoryRound =
      params.replayMemoryWrites && m.role === 'assistant'
        ? memoryWriteRound(m.memoryWrites, params.replayMemoryWrites)
        : undefined;
    const rounds = [
      ...(m.role === 'assistant' && Array.isArray(m.toolRounds) ? m.toolRounds : []),
      ...(memoryRound ? [memoryRound] : []),
    ];
    const toolRounds = rounds.length > 0 ? rounds : undefined;
    if (!combined && !toolRounds) continue;
    history.push({
      role: m.role,
      content: combined,
      createdAt: m.createdAt,
      attachments: m.attachments,
      annotations: m.annotations,
      ...(toolRounds
        ? { toolRounds, extraTokens: estimateTokens(JSON.stringify(toolRounds)) ?? 1 }
        : {}),
    });
  }

  if (typeof newUserContent === 'string') {
    history.push({
      role: 'user',
      content: newUserContent,
      createdAt: Date.now(),
      attachments: newUserAttachments,
    });
  }

  // 2. Attachments travel with their message and count toward its budget, so
  // an old one is dropped like any other words. Only the latest messages that
  // carry files send them in full.
  let withFiles = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const attachments = entry.role === 'user' ? entry.attachments : undefined;
    if (!attachments?.length) continue;
    const carries = AttachmentProcessor.carriesFiles(attachments, { canSee, canAudio });
    if (carries) withFiles += 1;
    entry.replay = {
      canSee,
      canAudio,
      files: carries && withFiles <= MESSAGES_WITH_FILES_IN_FULL,
    };
    entry.extraTokens =
      (entry.extraTokens ?? 0) + AttachmentProcessor.tokens(attachments, entry.replay);
  }

  // 3. Budget Tokens
  const budgeter = new TokenBudgeter(contextLimit, reserved);
  const indicesToKeep = budgeter.budget(history);
  const kept = indicesToKeep.map((i) => history[i]);

  // 4. Format Messages
  const finalMsgs: ModelMessage[] = [];
  const allocateToolCallId = createToolCallIdAllocator();

  // System
  if (chat.settings.system && chat.settings.system.trim()) {
    finalMsgs.push({ role: 'system', content: chat.settings.system.trim() });
  }

  // Conversation
  for (const k of kept) {
    const stamp = (text: string) =>
      timestamps && typeof k.createdAt === 'number'
        ? `[${formatMessageTimestamp(k.createdAt)}] ${text}`
        : text;
    if (k.role === 'assistant' && k.toolRounds) {
      finalMsgs.push(
        ...replayAssistantTurn({
          content: k.content,
          rounds: k.toolRounds,
          allocateId: allocateToolCallId,
          decorate: stamp,
          annotations: k.annotations,
        }),
      );
      continue;
    }
    const content = stamp(k.content);
    if (k.role === 'user' && Array.isArray(k.attachments) && k.attachments.length > 0) {
      const blocks = AttachmentProcessor.process(k.attachments, k.replay);
      if (content && content.trim()) {
        blocks.unshift({ type: 'text', text: content });
      }
      finalMsgs.push({ role: 'user', content: blocks });
    } else if (k.role === 'assistant') {
      if (k.annotations) {
        finalMsgs.push({ role: 'assistant', content, annotations: k.annotations });
      } else {
        finalMsgs.push({ role: 'assistant', content });
      }
    } else {
      finalMsgs.push({ role: 'user', content });
    }
  }

  return finalMsgs;
}
