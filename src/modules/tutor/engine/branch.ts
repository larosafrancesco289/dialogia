// Module: tutor engine branch
// Responsibility: the part of a chat's log that a branch of it inherits, re-addressed to the
// branch's chat and message ids.

import type { TutorEvent } from '@/modules/tutor/engine/events';

export type BranchSpec = {
  chatId: string;
  /** Source message id to the id of its copy, for every message the branch copied. */
  copied: Readonly<Record<string, string>>;
  /** Source message ids after the branch point: what they recorded stays behind. */
  later: ReadonlySet<string>;
  /** The latest log position a copied reply saw when it was composed (`Message.tutorSeq`). */
  seenSeq?: number;
  newId: () => string;
};

/**
 * The events a branch inherits: everything that belongs to a copied message
 * (a turn's own events, the learner's answers to its cards, a retraction of
 * it), nothing that belongs to a message after the branch point, and events
 * that belong to no message (quiet corrections, the legacy import) up to the
 * branch point. That point is the latest log position a copied message
 * accounts for, and never earlier than the legacy import: imported history
 * (the plan, the learner model, the cards it closed) is what every message of
 * an imported chat stands on, and no copied reply records having seen it.
 * Positions keep their numbers, so the copies' `tutorSeq` still means what it
 * meant.
 */
export function branchEvents(events: readonly TutorEvent[], spec: BranchSpec): TutorEvent[] {
  const owner = (event: TutorEvent) =>
    event.type === 'reply_retracted' ? event.replyId : event.messageId;
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const imported = sorted.find((event) => event.type === 'legacy_imported')?.seq ?? 0;
  const cut = sorted.reduce(
    (max, event) => {
      const id = owner(event);
      return id && id in spec.copied ? Math.max(max, event.seq) : max;
    },
    Math.max(spec.seenSeq ?? 0, imported),
  );

  const out: TutorEvent[] = [];
  for (const event of sorted) {
    const id = owner(event);
    const copiedTo = id ? spec.copied[id] : undefined;
    if (!copiedTo && id && spec.later.has(id)) continue;
    if (!copiedTo && event.seq > cut) continue;
    const moved = { ...event, id: spec.newId(), chatId: spec.chatId } as TutorEvent;
    if (copiedTo && moved.messageId) moved.messageId = copiedTo;
    if (copiedTo && moved.type === 'reply_retracted') moved.replyId = copiedTo;
    out.push(moved);
  }
  return out;
}
