import type { ReactNode } from 'react';

export type TabId = 'providers' | 'models-routing' | 'chat' | 'tutor' | 'appearance' | 'advanced';

export type SectionId =
  | 'providers'
  | 'endpoints'
  | 'web-search'
  | 'models'
  | 'general'
  | 'reasoning'
  | 'tutor'
  | 'display'
  | 'theme'
  | 'privacy'
  | 'data';

export type RenderSection = (tabId: TabId, sectionId: SectionId, content: ReactNode) => ReactNode;
