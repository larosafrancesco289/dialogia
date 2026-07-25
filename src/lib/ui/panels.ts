// Module: ui/panels
// Responsibility: The typed UI slots the shell resolves. A module supplies components;
// core mounts them without knowing what they render. With no modules installed every
// slot is empty and the shell renders nothing extra.

import type { ComponentType } from 'react';
import type { Message } from '@/lib/types';
import type { RenderSection } from '@/components/settings/types';

/** Slots that need nothing from the shell — the component subscribes to the store. */
export type StandalonePanelSlot =
  // Docked panel beside the conversation.
  | 'rightPanel'
  // Controls and overlays in the app header.
  | 'headerControls';

/** Slots rendered per assistant message. */
export type MessagePanelSlot =
  // Below the message content, above the footer.
  | 'messagePanel'
  // After the message content and any panels.
  | 'messageFooter';

export type MessagePanelProps = { message: Message };

/**
 * The settings drawer hands its section renderer and autosave wrapper to a module's
 * section. Both are core-owned drawer infrastructure, not module concepts.
 */
export type SettingsSectionProps = {
  renderSection: RenderSection;
  createAutoSaveSetter: <T>(setter: (value: T) => void) => (value: T) => void;
};

export type ModulePanels = Partial<
  Record<StandalonePanelSlot, ComponentType> &
    Record<MessagePanelSlot, ComponentType<MessagePanelProps>> & {
      settingsSection: ComponentType<SettingsSectionProps>;
    }
>;
