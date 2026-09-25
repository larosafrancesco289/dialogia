import type { Chat, Message, ModelDescriptor, ToolCallLogEntry } from '@/lib/types';
import type { SearchSourcesData } from '@/lib/ui/responseActivity';
import { ResponseContextPanel } from '@/components/message/ResponseContextPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { resolveDeveloperPanel } from '@/lib/ui/developerPanel';

export type MessagePanelsProps = {
  message: Message;
  chat?: Chat | null;
  models: ModelDescriptor[];
  /** The reply's search sources, tool-based or provider-native (`resolveMessageSources`). */
  sources?: SearchSourcesData;
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
 * - Search sources
 * - Debug panel
 * - Reasoning panel
 */
export function MessagePanelsUpper({
  message,
  sources,
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
    sources,
    toolCalls: toolCallList,
    isStreaming,
    lastMessageId,
    expanded: reasoningExpanded || _isSourcesExpanded,
    onToggle: onToggleReasoning,
  });
  if (contextPanel) panels.push(contextPanel);

  const developer = resolveDeveloperPanel({
    debugMode,
    debugBody: debugEntry?.body,
    showToolCallLog,
    toolCallCount: toolCallList?.length ?? 0,
  });
  if (developer) {
    panels.push(
      <DebugPanel
        key="debug"
        body={developer.body}
        toolCalls={toolCallList}
        showToolCalls={developer.showToolCalls}
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
  sources,
  toolCalls,
  isStreaming,
  lastMessageId,
  expanded,
  onToggle,
}: {
  message: Message;
  sources?: SearchSourcesData;
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

  const hasSearch = !!sources;
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0;

  if (!shouldRender && !hasSearch && !hasTools) return null;

  return (
    <ResponseContextPanel
      key="response-context"
      reasoning={reasoningText}
      toolCalls={toolCalls}
      activity={message.activity}
      sources={sources}
      expanded={expanded}
      onToggle={onToggle}
      isStreaming={shouldStream}
    />
  );
}
