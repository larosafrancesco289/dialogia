import type { ReactNode } from 'react';

export type TabId = 'models-routing' | 'chat' | 'tutor' | 'appearance' | 'advanced';

export type SectionId =
  | 'models'
  | 'web-search'
  | 'routing'
  | 'general'
  | 'generation'
  | 'reasoning'
  | 'tutor'
  | 'display'
  | 'theme'
  | 'privacy'
  | 'data'
  | 'experimental'
  | 'usage-stats';

export type RenderSection = (tabId: TabId, sectionId: SectionId, content: ReactNode) => ReactNode;
