'use client';
import { findModelById, isReasoningSupported } from '@/lib/models';
import type { Chat, Message, MessageTutor, ModelDescriptor, ToolCallLogEntry } from '@/lib/types';
import type { UISearchState } from '@/lib/store/types';
import { BraveSourcesPanel } from '@/components/message/BraveSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { TutorPanel } from '@/components/message/tutor/TutorPanel';

export type MessagePanelsProps = {
  message: Message;
  chat?: Chat | null;
  models: ModelDescriptor[];
  braveGloballyEnabled: boolean;
  braveEntry?: NonNullable<UISearchState['braveByMessageId']>[string];
  isSourcesExpanded: boolean;
  onToggleSources: () => void;
  debugMode: boolean;
  debugEntry?: { body: string; createdAt: number } | null;
  isDebugExpanded: boolean;
  onToggleDebug: () => void;
  tutorGloballyEnabled: boolean;
  tutorEntry?: MessageTutor;
  autoReasoningModelIds: Record<string, boolean>;
  isStreaming: boolean;
  lastMessageId?: string;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  toolCalls?: ToolCallLogEntry[];
  highlightToolCalls?: boolean;
};

/**
 * Renders panels that appear ABOVE the message content:
 * - Brave sources
 * - Debug panel
 * - Reasoning panel
 */
export function MessagePanelsUpper({
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
  autoReasoningModelIds,
  isStreaming,
  lastMessageId,
  reasoningExpanded,
  onToggleReasoning,
  showToolCallLog,
  showDebugRawJson,
  toolCalls,
  highlightToolCalls,
}: Omit<MessagePanelsProps, 'tutorGloballyEnabled' | 'tutorEntry'>) {
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

  const toolCallList = Array.isArray(toolCalls) ? toolCalls : undefined;
  const shouldShowToolLog = showToolCallLog && toolCallList && toolCallList.length > 0;
  if (debugMode && (debugEntry?.body || shouldShowToolLog)) {
    panels.push(
      <DebugPanel
        key="debug"
        body={debugEntry?.body}
        toolCalls={toolCallList}
        showToolCalls={showToolCallLog}
        showRawJson={showDebugRawJson}
        highlightToolCalls={highlightToolCalls}
        expanded={isDebugExpanded}
        onToggle={onToggleDebug}
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

  if (panels.length === 0) return null;
  return <>{panels}</>;
}

/**
 * Renders the tutor panel that appears BELOW the message content.
 * This ensures the tutor's explanatory text is visible before the interactive tools.
 */
export function TutorPanelSection({
  messageId,
  tutorGloballyEnabled,
  tutorEntry,
  isLatestAssistant,
}: {
  messageId: string;
  tutorGloballyEnabled: boolean;
  tutorEntry?: MessageTutor;
  isLatestAssistant?: boolean;
}) {
  if (!tutorGloballyEnabled || !tutorEntry) return null;

  return (
    <TutorPanel
      messageId={messageId}
      title={tutorEntry.title}
      mcq={tutorEntry.mcq}
      fillBlank={tutorEntry.fillBlank}
      openEnded={tutorEntry.openEnded}
      questionnaire={tutorEntry.questionnaire}
      diagnostic={tutorEntry.diagnostic}
      planProposal={tutorEntry.planProposal}
      planSuggestions={tutorEntry.planSuggestions}
      assessmentUpdates={tutorEntry.assessmentUpdates}
      grading={tutorEntry.grading}
      isLatestAssistant={isLatestAssistant}
    />
  );
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
  models: ModelDescriptor[];
  autoReasoningModelIds: Record<string, boolean>;
  isStreaming: boolean;
  lastMessageId?: string;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
}): React.ReactNode {
  const reasoningText = typeof message.reasoning === 'string' ? (message.reasoning as string) : '';
  const deepResearch = message.deepResearch;
  const hasDeepResearch = !!(deepResearch?.trace && deepResearch.trace.length > 0);
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;
  const messageModelId = (message.model || chat?.settings?.modelId) ?? undefined;
  const modelMeta = messageModelId ? findModelById(models, messageModelId) : undefined;
  const modelAllowsReasoning = !!modelMeta && isReasoningSupported(modelMeta);
  const hasReasoning = reasoningText.trim().length > 0;

  const messageEffort = message.genSettings?.reasoningEffort;
  const messageTokens = message.genSettings?.reasoningTokens;
  const chatEffort = chat?.settings.generation.reasoningEffort;
  const chatTokens = chat?.settings.generation.reasoningTokens;
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

  const shouldStream = isLatestAssistant && isStreaming && (allowStreaming || hasDeepResearch);

  if (!hasReasoning && !allowStreaming && !hasDeepResearch) return null;

  return (
    <ReasoningPanel
      key="reasoning"
      reasoning={reasoningText}
      deepResearch={deepResearch}
      expanded={reasoningExpanded}
      onToggle={onToggleReasoning}
      isStreaming={shouldStream}
    />
  );
}
