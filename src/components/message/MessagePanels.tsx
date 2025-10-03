'use client';
import { findModelById, isReasoningSupported } from '@/lib/models';
import type { Chat, Message, ORModel } from '@/lib/types';
import { BraveSourcesPanel } from '@/components/message/BraveSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { TutorPanel } from '@/components/message/TutorPanel';

export type MessagePanelsProps = {
  message: Message;
  chat?: Chat | null;
  models: ORModel[];
  braveGloballyEnabled: boolean;
  braveEntry?: any;
  isSourcesExpanded: boolean;
  onToggleSources: () => void;
  debugMode: boolean;
  debugEntry?: { body: string; createdAt: number } | null;
  isDebugExpanded: boolean;
  onToggleDebug: () => void;
  tutorGloballyEnabled: boolean;
  tutorEnabled: boolean;
  tutorEntry?: any;
  tutorMemoryDebug?: any;
  tutorMemoryAutoUpdateDefault: boolean;
  updateChatSettings: (settings: Partial<Chat['settings']>) => Promise<void> | void;
  autoReasoningModelIds: Record<string, boolean>;
  isStreaming: boolean;
  lastMessageId?: string;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
};

export default function MessagePanels({
  message,
  chat,
  models,
  braveGloballyEnabled,
  braveEntry,
  isSourcesExpanded,
  onToggleSources,
  debugMode,
  debugEntry,
  isDebugExpanded,
  onToggleDebug,
  tutorGloballyEnabled,
  tutorEnabled,
  tutorEntry,
  tutorMemoryDebug,
  tutorMemoryAutoUpdateDefault,
  updateChatSettings,
  autoReasoningModelIds,
  isStreaming,
  lastMessageId,
  reasoningExpanded,
  onToggleReasoning,
}: MessagePanelsProps) {
  const panels: React.ReactNode[] = [];

  if (braveGloballyEnabled && braveEntry) {
    panels.push(
      <BraveSourcesPanel
        key="brave"
        data={braveEntry}
        expanded={isSourcesExpanded}
        onToggle={onToggleSources}
      />,
    );
  }

  if (debugMode && debugEntry?.body) {
    const memoryInfo = (() => {
      if (!tutorEnabled) return undefined;
      const mem = tutorMemoryDebug || {};
      const memoryDisabled = chat?.settings.tutor_memory_disabled === true;
      return {
        enabled: !memoryDisabled,
        defaultEnabled: tutorMemoryAutoUpdateDefault,
        version: mem.version ?? chat?.settings.tutor_memory_version,
        messageCount: mem.messageCount ?? chat?.settings.tutor_memory_message_count,
        after: mem.after ?? chat?.settings.tutor_memory,
        before: mem.before,
        raw: mem.raw,
        conversationWindow: mem.conversationWindow,
        model: mem.model,
        updatedAt: mem.updatedAt,
      };
    })();

    panels.push(
      <DebugPanel
        key="debug"
        body={debugEntry.body}
        expanded={isDebugExpanded}
        onToggle={onToggleDebug}
        memoryInfo={memoryInfo}
        onToggleMemory={
          tutorEnabled && chat
            ? async () => {
                const memoryDisabled = chat.settings.tutor_memory_disabled === true;
                await updateChatSettings({
                  tutor_memory_disabled: memoryDisabled ? false : true,
                });
              }
            : undefined
        }
      />,
    );
  }

  const reasoningPanel = buildReasoningPanel({
    message,
    chat,
    models,
    autoReasoningModelIds,
    isStreaming,
    lastMessageId,
    reasoningExpanded,
    onToggleReasoning,
  });
  if (reasoningPanel) panels.push(reasoningPanel);

  if (tutorGloballyEnabled && tutorEntry) {
    panels.push(
      <TutorPanel
        key="tutor"
        messageId={message.id}
        title={tutorEntry.title}
        mcq={tutorEntry.mcq}
        fillBlank={tutorEntry.fillBlank}
        openEnded={tutorEntry.openEnded}
        flashcards={tutorEntry.flashcards}
        grading={tutorEntry.grading}
      />,
    );
  }

  if (panels.length === 0) return null;
  return <>{panels}</>;
}

function buildReasoningPanel({
  message,
  chat,
  models,
  autoReasoningModelIds,
  isStreaming,
  lastMessageId,
  reasoningExpanded,
  onToggleReasoning,
}: {
  message: Message;
  chat?: Chat | null;
  models: ORModel[];
  autoReasoningModelIds: Record<string, boolean>;
  isStreaming: boolean;
  lastMessageId?: string;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
}): React.ReactNode {
  const reasoningText = typeof message.reasoning === 'string' ? (message.reasoning as string) : '';
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;
  const messageModelId = (message.model || chat?.settings?.model) ?? undefined;
  const modelMeta = messageModelId ? findModelById(models, messageModelId) : undefined;
  const modelAllowsReasoning = !!modelMeta && isReasoningSupported(modelMeta);
  const hasReasoning = reasoningText.trim().length > 0;

  const messageEffort = (message as any).genSettings?.reasoning_effort;
  const messageTokens = (message as any).genSettings?.reasoning_tokens;
  const chatEffort = chat?.settings.reasoning_effort;
  const chatTokens = chat?.settings.reasoning_tokens;
  const effortRequested =
    typeof messageEffort === 'string'
      ? messageEffort !== 'none'
      : typeof chatEffort === 'string'
        ? chatEffort !== 'none'
        : false;
  const tokensRequested =
    typeof messageTokens === 'number'
      ? messageTokens > 0
      : typeof chatTokens === 'number'
        ? chatTokens > 0
        : false;
  const isAutoReasoningModel = !!(messageModelId && autoReasoningModelIds[messageModelId]);
  const allowStreaming =
    (effortRequested || tokensRequested || isAutoReasoningModel) &&
    modelAllowsReasoning &&
    isLatestAssistant &&
    isStreaming;

  if (!hasReasoning && !allowStreaming) return null;

  return (
    <ReasoningPanel
      key="reasoning"
      reasoning={reasoningText}
      expanded={reasoningExpanded}
      onToggle={onToggleReasoning}
      isStreaming={allowStreaming}
    />
  );
}
