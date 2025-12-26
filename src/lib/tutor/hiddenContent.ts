import type { MessageTutor } from '@/lib/types';
import { getTutorContext } from '@/lib/tutor/context';

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
