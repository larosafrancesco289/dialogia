import { Suspense, type ComponentType } from 'react';
import type {
  MessagePanelProps,
  MessagePanelSlot,
  SettingsSectionProps,
  StandalonePanelSlot,
} from '@/lib/ui/panels';
import { ENABLED_MODULES } from '@/lib/modules';

type SlotName = StandalonePanelSlot | MessagePanelSlot | 'settingsSection';

function componentsFor(slot: SlotName) {
  const entries: { id: string; Component: ComponentType<never> }[] = [];
  for (const appModule of ENABLED_MODULES) {
    const Component = appModule.panels?.[slot];
    if (Component) entries.push({ id: appModule.id, Component: Component as ComponentType<never> });
  }
  return entries;
}

// Panels are lazily loaded, and none of them is critical to first paint, so a slot
// renders nothing until its chunk arrives.
function Slot({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** Mounts whatever the enabled modules put in a standalone slot. */
export function ModuleSlot({ slot }: { slot: StandalonePanelSlot }) {
  return (
    <Slot>
      {componentsFor(slot).map(({ id, Component }) => {
        const Mounted = Component as ComponentType;
        return <Mounted key={id} />;
      })}
    </Slot>
  );
}

/** Mounts whatever the enabled modules put in a per-message slot. */
export function MessageModuleSlot({
  slot,
  message,
}: { slot: MessagePanelSlot } & MessagePanelProps) {
  return (
    <Slot>
      {componentsFor(slot).map(({ id, Component }) => {
        const Mounted = Component as ComponentType<MessagePanelProps>;
        return <Mounted key={id} message={message} />;
      })}
    </Slot>
  );
}

/** Mounts whatever the enabled modules put in the settings drawer. */
export function SettingsModuleSlot(props: SettingsSectionProps) {
  return (
    <Slot>
      {componentsFor('settingsSection').map(({ id, Component }) => {
        const Mounted = Component as ComponentType<SettingsSectionProps>;
        return <Mounted key={id} {...props} />;
      })}
    </Slot>
  );
}
