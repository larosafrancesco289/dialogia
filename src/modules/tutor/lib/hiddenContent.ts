import type { Message, MessageTutor } from '@/lib/types';
import { getTutorContext } from '@/modules/tutor/lib/context';

export function buildHiddenTutorContent(tutor: MessageTutor | undefined): string {
  try {
    const { summary: recap, full: json } = getTutorContext(tutor);
    const parts: string[] = [];
    if (recap) parts.push(`Tutor Recap:\n${recap}`);
    if (json) parts.push(`Tutor Data JSON:\n${json}`);
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

/**
 * The tutor module's `AppModule.decorateMessage`: keeps `hiddenContent` in sync with
 * the message's tutor payload so the model sees the recap without the user doing so.
 */
export function decorateTutorMessage(message: Message): Message {
  if (!message?.tutor) return message;
  const hidden = buildHiddenTutorContent(message.tutor);
  if (!hidden) return message;
  return { ...message, hiddenContent: hidden };
}
