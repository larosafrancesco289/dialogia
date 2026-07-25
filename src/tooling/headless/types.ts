import type { PlanTurnResult, TurnComposition } from '@/lib/agent/types';
import type { StoreState } from '@/lib/store/types';
import { selectTutorEntry } from '@/modules/tutor/ui/tutorSelectors';
import type { Message, MessageTutor, ToolCallLogEntry, PersistedAttachment } from '@/lib/types';
import type { LearnerModelDebugEntry } from '@/lib/store/types';
import { getMessagesForChat } from '@/lib/messages/indexing';

export type HeadlessTurnArtifacts = {
  composition: {
    system?: string;
    tools?: TurnComposition['tools'];
    plugins?: TurnComposition['plugins'];
    settings?: TurnComposition['settings'];
    shouldPlan: boolean;
  };
  plan: PlanTurnResult;
  tutorUi?: Record<string, unknown>;
  toolCalls?: ToolCallLogEntry[];
  debugPayload?: string;
};

export type HeadlessTurnResult = {
  user: Message;
  assistant: Message;
  artifacts: HeadlessTurnArtifacts;
};

export type HeadlessTurnSnapshot = {
  chatId: string;
  messageId: string;
  turnIndex: number;
  user: {
    id: string;
    content: string;
    createdAt: number;
  };
  assistant: {
    id: string;
    content: string;
    createdAt?: number;
    hiddenContent?: string;
    reasoning?: string;
    modelId?: string;
    metrics?: Message['metrics'];
    tokensIn?: number;
    tokensOut?: number;
    annotations?: Message['annotations'];
    attachments?: PersistedAttachment[];
    toolCalls?: ToolCallLogEntry[];
    tutor?: MessageTutor;
    learnerModel?: Message['learnerModel'];
    planUpdates?: Message['planUpdates'];
    systemSnapshot?: string;
    genSettings?: Message['genSettings'];
    debugRequestBody?: string;
    tutorUi?: ReturnType<typeof selectTutorEntry>;
    learnerModelDebug?: LearnerModelDebugEntry;
  };
  composition: HeadlessTurnArtifacts['composition'];
  plan: PlanTurnResult;
};

export function buildHeadlessTurnSnapshot(
  state: StoreState,
  chatId: string,
  assistantMessageId: string,
  artifacts: HeadlessTurnArtifacts,
  turnIndex: number,
): HeadlessTurnSnapshot {
  const messages = getMessagesForChat(state, chatId);
  const assistantIndex = messages.findIndex((msg) => msg.id === assistantMessageId);
  if (assistantIndex === -1) {
    throw new Error(`Assistant message ${assistantMessageId} not found for chat ${chatId}`);
  }

  const assistant = messages[assistantIndex];
  const user =
    [...messages]
      .slice(0, assistantIndex)
      .reverse()
      .find((msg) => msg.role === 'user') ?? undefined;

  if (!user) {
    throw new Error(`No user message found before assistant ${assistantMessageId}`);
  }

  const tutorUi = selectTutorEntry(state.ui, assistantMessageId) ?? artifacts.tutorUi;
  // Look up debug entry by exact messageId or by round-keyed entries (e.g. msgId_r0, msgId_r1)
  const debugMap = state.ui.debug.byMessageId ?? {};
  let debugEntry = debugMap[assistantMessageId];
  if (!debugEntry) {
    // Collect all round entries for this message, prefer the latest round
    const roundEntries = Object.entries(debugMap)
      .filter(([key]) => key.startsWith(`${assistantMessageId}_r`))
      .sort(([a], [b]) => a.localeCompare(b));
    if (roundEntries.length > 0) {
      debugEntry = roundEntries[roundEntries.length - 1][1];
    }
  }
  const learnerModelDebug = state.ui.debug.learnerModelDebugByMessageId?.[assistantMessageId];

  return {
    chatId,
    messageId: assistantMessageId,
    turnIndex,
    user: {
      id: user.id,
      content: user.content,
      createdAt: user.createdAt,
    },
    assistant: {
      id: assistant.id,
      content: assistant.content,
      createdAt: assistant.createdAt,
      hiddenContent: assistant.hiddenContent,
      reasoning: assistant.reasoning,
      modelId: assistant.model,
      metrics: assistant.metrics,
      tokensIn: assistant.tokensIn,
      tokensOut: assistant.tokensOut,
      annotations: assistant.annotations,
      attachments: assistant.attachments,
      toolCalls: assistant.toolCalls ?? artifacts.toolCalls,
      tutor: assistant.tutor,
      learnerModel: assistant.learnerModel,
      planUpdates: assistant.planUpdates,
      systemSnapshot: assistant.systemSnapshot,
      genSettings: assistant.genSettings,
      debugRequestBody: debugEntry?.body ?? artifacts.debugPayload,
      tutorUi,
      learnerModelDebug,
    },
    composition: artifacts.composition,
    plan: artifacts.plan,
  };
}
