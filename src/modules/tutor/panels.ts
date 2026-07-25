// Module: modules/tutor/panels
// Responsibility: The tutor module's contribution to the shell's UI slots. This is
// the only place the module names where in the app it appears.
//
// Every entry is `React.lazy`, for two reasons: the components import the store,
// which imports `@/lib/modules`, so a static import here would be a cycle; and it
// keeps the tutor UI out of the first-load bundle.

import { lazy } from 'react';
import type { ModulePanels } from '@/lib/ui/panels';

export const tutorPanels: ModulePanels = {
  rightPanel: lazy(() =>
    import('@/modules/tutor/components/learning-panel/LearningPanel').then((m) => ({
      default: m.LearningPanel,
    })),
  ),
  headerControls: lazy(() =>
    import('@/modules/tutor/components/header/TutorHeaderSlot').then((m) => ({
      default: m.TutorHeaderSlot,
    })),
  ),
  settingsSection: lazy(() =>
    import('@/modules/tutor/components/settings/TutorSettingsSection').then((m) => ({
      default: m.TutorSettingsSection,
    })),
  ),
  messagePanel: lazy(() =>
    import('@/modules/tutor/components/message/TutorMessagePanel').then((m) => ({
      default: m.TutorMessagePanel,
    })),
  ),
  messageFooter: lazy(() =>
    import('@/modules/tutor/components/message/LearnerModelUpdates').then((m) => ({
      default: m.LearnerModelUpdates,
    })),
  ),
};
