'use client';
import type { Chat, Message, MessageTutor, ModelDescriptor, ToolCallLogEntry } from '@/lib/types';
import type { UISearchState } from '@/lib/store/types';
import { SearchSourcesPanel } from '@/components/message/SearchSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { TutorPanel } from '@/components/message/tutor/TutorPanel';

export type MessagePanelsProps = {
  message: Message;
  chat?: Chat | null;
  models: ModelDescriptor[];
  tavilyEntry?: NonNullable<UISearchState['tavilyByMessageId']>[string];
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

export function getReasoningPanelState({
  message,
  isStreaming,
  lastMessageId,
}: {
  message: Message;
  isStreaming: boolean;
  lastMessageId?: string;
}) {
  const reasoningText = typeof message.reasoning === 'string' ? message.reasoning : '';
  const hasReasoning = reasoningText.trim().length > 0;
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;

  return {
    reasoningText,
    shouldRender: hasReasoning,
    shouldStream: isLatestAssistant && isStreaming && hasReasoning,
  };
}

/**
 * Renders panels that appear ABOVE the message content:
 * - Tavily sources
 * - Debug panel
 * - Reasoning panel
 */
export function MessagePanelsUpper({
  message,
  tavilyEntry,
  isSourcesExpanded,
  onToggleSources,
  debugMode,
  debugEntry,
  isDebugExpanded,
  onToggleDebug,
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

  if (tavilyEntry) {
    panels.push(
      <SearchSourcesPanel
        key="tavily"
        data={tavilyEntry}
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
      questionnaire={tutorEntry.questionnaire}
      diagnostic={tutorEntry.diagnostic}
      planProposal={tutorEntry.planProposal}
      planSuggestions={tutorEntry.planSuggestions}
      assessmentUpdates={tutorEntry.assessmentUpdates}
      isLatestAssistant={isLatestAssistant}
    />
  );
}

function buildReasoningPanel({
  message,
  isStreaming,
  lastMessageId,
  reasoningExpanded,
  onToggleReasoning,
}: {
  message: Message;
  isStreaming: boolean;
  lastMessageId?: string;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
}): React.ReactNode {
  const { reasoningText, shouldRender, shouldStream } = getReasoningPanelState({
    message,
    isStreaming,
    lastMessageId,
  });

  if (!shouldRender) return null;

  return (
    <ReasoningPanel
      key="reasoning"
      reasoning={reasoningText}
      expanded={reasoningExpanded}
      onToggle={onToggleReasoning}
      isStreaming={shouldStream}
    />
  );
}
