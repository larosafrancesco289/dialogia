export type MessagePanelState = {
  sources: { expanded: boolean; onToggle: () => void };
  debug: { expanded: boolean; onToggle: () => void };
  reasoning: { expanded: boolean; onToggle: () => void };
};
