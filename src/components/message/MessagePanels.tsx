'use client';
import type { Chat, Message, ModelDescriptor, ToolCallLogEntry } from '@/lib/types';
import type { UISearchState } from '@/lib/store/types';
import { ResponseContextPanel } from '@/components/message/ResponseContextPanel';
import { DebugPanel } from '@/components/message/DebugPanel';

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
  isSourcesExpanded: _isSourcesExpanded,
  onToggleSources: _onToggleSources,
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
}: MessagePanelsProps) {
  const panels: React.ReactNode[] = [];

  const toolCallList = Array.isArray(toolCalls) ? toolCalls : undefined;
  const contextPanel = buildResponseContextPanel({
    message,
    tavilyEntry,
    toolCalls: toolCallList,
    isStreaming,
    lastMessageId,
    expanded: reasoningExpanded || _isSourcesExpanded,
    onToggle: onToggleReasoning,
  });
  if (contextPanel) panels.push(contextPanel);

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

  if (panels.length === 0) return null;
  return <>{panels}</>;
}

function buildResponseContextPanel({
  message,
  tavilyEntry,
  toolCalls,
  isStreaming,
  lastMessageId,
  expanded,
  onToggle,
}: {
  message: Message;
  tavilyEntry?: NonNullable<UISearchState['tavilyByMessageId']>[string];
  toolCalls?: ToolCallLogEntry[];
  isStreaming: boolean;
  lastMessageId?: string;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactNode {
  const { reasoningText, shouldRender, shouldStream } = getReasoningPanelState({
    message,
    isStreaming,
    lastMessageId,
  });

  const hasSearch = !!tavilyEntry;
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0;

  if (!shouldRender && !hasSearch && !hasTools) return null;

  return (
    <ResponseContextPanel
      key="response-context"
      reasoning={reasoningText}
      toolCalls={toolCalls}
      activity={message.activity}
      sources={tavilyEntry}
      expanded={expanded}
      onToggle={onToggle}
      isStreaming={shouldStream}
    />
  );
}
