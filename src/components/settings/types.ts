import type { ReactNode } from 'react';

export type TabId = 'connections' | 'models' | 'chat' | 'tutor' | 'appearance' | 'data';

export type SectionId =
  | 'providers'
  | 'endpoints'
  | 'web-search'
  | 'default-model'
  | 'favorites'
  | 'privacy'
  | 'general'
  | 'memory'
  | 'reasoning'
  | 'tutor'
  | 'theme'
  | 'language'
  | 'display'
  | 'developer'
  | 'data';

export type RenderSection = (tabId: TabId, sectionId: SectionId, content: ReactNode) => ReactNode;
