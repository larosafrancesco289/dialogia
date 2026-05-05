import type { ReactNode } from 'react';

export type TabId = 'models-routing' | 'chat' | 'tutor' | 'appearance' | 'advanced';

export type SectionId =
  | 'models'
  | 'general'
  | 'reasoning'
  | 'tutor'
  | 'display'
  | 'theme'
  | 'privacy'
  | 'data';

export type RenderSection = (tabId: TabId, sectionId: SectionId, content: ReactNode) => ReactNode;
