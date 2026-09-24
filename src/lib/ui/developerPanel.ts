// Module: ui/developerPanel
// Responsibility: What a reply's developer panel shows. The two Settings switches
// are independent: the captured request needs the debug view on, the tool-call
// log only its own switch.

export type DeveloperPanelContent = { body?: string; showToolCalls: boolean };

export function resolveDeveloperPanel(args: {
  debugMode: boolean;
  /** The request captured for this reply; kept in memory after the view is turned off. */
  debugBody?: string;
  showToolCallLog: boolean;
  toolCallCount: number;
}): DeveloperPanelContent | null {
  const body = args.debugMode && args.debugBody?.trim() ? args.debugBody : undefined;
  const showToolCalls = args.showToolCallLog && args.toolCallCount > 0;
  if (!body && !showToolCalls) return null;
  return { body, showToolCalls };
}
