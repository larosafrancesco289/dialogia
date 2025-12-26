export type DeepResearchEvent = {
  type: 'search' | 'fetch' | 'time' | 'note' | 'thought';
  input?: unknown;
  output?: unknown;
};
