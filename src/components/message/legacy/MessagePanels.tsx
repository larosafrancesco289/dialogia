'use client';
import { MessagePanelsUpper, TutorPanelSection } from '@/components/message/MessagePanels';
import type { MessagePanelsProps } from '@/components/message/MessagePanels';

export type { MessagePanelsProps };

/**
 * @deprecated Use MessagePanelsUpper and TutorPanelSection separately for proper ordering.
 * This is kept for backward compatibility but renders all panels together.
 */
export function MessagePanels(props: MessagePanelsProps) {
  const { tutorGloballyEnabled, tutorEntry, message, ...upperProps } = props;

  const upperPanels = <MessagePanelsUpper message={message} {...upperProps} />;
  const tutorPanel = (
    <TutorPanelSection
      messageId={message.id}
      tutorGloballyEnabled={tutorGloballyEnabled}
      tutorEntry={tutorEntry}
    />
  );

  const hasUpper = upperPanels !== null;
  const hasTutor = tutorGloballyEnabled && tutorEntry;

  if (!hasUpper && !hasTutor) return null;
  return (
    <>
      {upperPanels}
      {tutorPanel}
    </>
  );
}
