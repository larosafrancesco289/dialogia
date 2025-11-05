import { useCallback, useState } from 'react';

type ToggleState = Record<string, boolean>;

type UseMessagePanelsTogglesArgs = {
  showReasoningByDefault: boolean;
};

export function useMessagePanelsToggles({
  showReasoningByDefault,
}: UseMessagePanelsTogglesArgs) {
  const [reasoningState, setReasoningState] = useState<ToggleState>({});
  const [sourcesState, setSourcesState] = useState<ToggleState>({});
  const [debugState, setDebugState] = useState<ToggleState>({});
  const [statsState, setStatsState] = useState<ToggleState>({});

  const toggleReasoning = useCallback(
    (id: string) => setReasoningState((prev) => ({ ...prev, [id]: !prev[id] })),
    [],
  );
  const isReasoningExpanded = useCallback(
    (id: string) => reasoningState[id] ?? showReasoningByDefault,
    [reasoningState, showReasoningByDefault],
  );

  const toggleSources = useCallback(
    (id: string) => setSourcesState((prev) => ({ ...prev, [id]: !prev[id] })),
    [],
  );
  const isSourcesExpanded = useCallback(
    (id: string) => sourcesState[id] ?? true,
    [sourcesState],
  );

  const toggleDebug = useCallback(
    (id: string) => setDebugState((prev) => ({ ...prev, [id]: !prev[id] })),
    [],
  );
  const isDebugExpanded = useCallback((id: string) => debugState[id] ?? false, [debugState]);

  const toggleStats = useCallback(
    (id: string) => setStatsState((prev) => ({ ...prev, [id]: !prev[id] })),
    [],
  );
  const isStatsExpanded = useCallback((id: string) => statsState[id] ?? false, [statsState]);

  return {
    isReasoningExpanded,
    toggleReasoning,
    isSourcesExpanded,
    toggleSources,
    isDebugExpanded,
    toggleDebug,
    isStatsExpanded,
    toggleStats,
  };
}
