import { useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { shownVersionIndex, versionCount } from '@/lib/messages/versions';
import { refocusIfDropped } from '@/lib/ui/focus';
import type { Message } from '@/lib/types';

/**
 * "‹ 2/3 ›" in a reply's footer: which of its Try again versions shows, and
 * the way to the others. Only the latest exchange can switch, since a later
 * turn was written under the version shown then; an earlier reply still says
 * how many it has.
 */
export function ReplyVersionSwitch({
  message,
  canSwitch,
  disabled,
  onDelete,
}: {
  message: Message;
  canSwitch: boolean;
  disabled: boolean;
  onDelete: (messageId: string) => void;
}) {
  const showReplyVersion = useChatStore((s) => s.showReplyVersion);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const count = versionCount(message);
  if (count < 2) return null;
  const at = shownVersionIndex(message);
  const locked = !canSwitch || disabled;

  // At either end the arrow pressed disables itself: focus crosses to the other.
  const step = (index: number) => {
    void showReplyVersion(message.id, index);
    refocusIfDropped(
      () => previousRef.current,
      () => nextRef.current,
    );
  };

  return (
    <div
      className="reply-versions"
      role="group"
      aria-label="Versions of this reply"
      title={canSwitch ? undefined : 'Only the latest reply can switch versions'}
    >
      <button
        ref={previousRef}
        type="button"
        className="icon-button icon-button--sm"
        aria-label="Previous version"
        title="Previous version"
        disabled={locked || at === 0}
        onClick={() => step(at - 1)}
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
      </button>
      <span className="reply-versions__count" aria-hidden="true">
        {at + 1}/{count}
      </span>
      <span className="sr-only" aria-live="polite">
        Version {at + 1} of {count}
      </span>
      <button
        ref={nextRef}
        type="button"
        className="icon-button icon-button--sm"
        aria-label="Next version"
        title="Next version"
        disabled={locked || at === count - 1}
        onClick={() => step(at + 1)}
      >
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </button>
      {!locked && (
        <button
          type="button"
          className="icon-button icon-button--sm"
          aria-label="Delete this version"
          title="Delete this version"
          onClick={() => onDelete(message.id)}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
