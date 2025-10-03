import type { ReactNode } from 'react';

export type TabId = 'models' | 'chat' | 'tutor' | 'display' | 'privacy' | 'data' | 'labs';

export type RenderSection = (tabId: TabId, sectionId: string, content: ReactNode) => ReactNode;
