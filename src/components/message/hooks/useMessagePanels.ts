import { useCallback } from 'react';
import { useMessagePanelsToggles } from '@/components/message/hooks/useMessagePanelsToggles';

export type MessagePanelState = {
  sources: { expanded: boolean; onToggle: () => void };
  debug: { expanded: boolean; onToggle: () => void };
  reasoning: { expanded: boolean; onToggle: () => void };
  stats: { expanded: boolean; onToggle: () => void };
};

export function useMessagePanels({ showReasoningByDefault }: { showReasoningByDefault: boolean }) {
  const panels = useMessagePanelsToggles({ showReasoningByDefault });

  const getPanelState = useCallback(
    (messageId: string): MessagePanelState => ({
      sources: {
        expanded: panels.isSourcesExpanded(messageId),
        onToggle: () => panels.toggleSources(messageId),
      },
      debug: {
        expanded: panels.isDebugExpanded(messageId),
        onToggle: () => panels.toggleDebug(messageId),
      },
      reasoning: {
        expanded: panels.isReasoningExpanded(messageId),
        onToggle: () => panels.toggleReasoning(messageId),
      },
      stats: {
        expanded: panels.isStatsExpanded(messageId),
        onToggle: () => panels.toggleStats(messageId),
      },
    }),
    [panels],
  );

  return { getPanelState };
}
