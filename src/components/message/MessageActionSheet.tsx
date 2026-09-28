import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowUturnRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CursorArrowRaysIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { Message } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { shownVersionIndex, versionCount } from '@/lib/messages/versions';
import { BottomSheet, SheetItem } from '@/components/ui/BottomSheet';
import { Markdown } from '@/components/Markdown';
import { plainExcerpt } from '@/lib/markdown/plainText';

export type MessageActionSheetProps = {
  isMobile: boolean;
  mobileSheet: { id: string; role: 'assistant' | 'user' } | null;
  mobileActionMessage: Message | null;
  editingId: string | null;
  isStreaming: boolean;
  onClose: () => void;
  onCopy: (messageId: string) => Promise<void> | void;
  onStartEditing: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  /** Whether the message can be regenerated, or (a user message) edited and rerun. */
  canRedo: boolean;
  /** Whether the reply's versions can be switched and deleted. */
  canSwitchVersion: boolean;
  onDeleteVersion: (messageId: string) => void;
};

/**
 * What a long press on a message offers on a phone. A long press there is
 * the sheet's, not the browser's, so "Select text" opens the words on a
 * page of their own where they can be selected like any text.
 */
export function MessageActionSheet({
  isMobile,
  mobileSheet,
  mobileActionMessage,
  editingId,
  isStreaming,
  onClose,
  onCopy,
  onStartEditing,
  onBranch,
  onRegenerate,
  canRedo,
  canSwitchVersion,
  onDeleteVersion,
}: MessageActionSheetProps) {
  const [selecting, setSelecting] = useState<Message | null>(null);
  const showReplyVersion = useChatStore((s) => s.showReplyVersion);

  // A new long press starts on the actions, never on an old selection page.
  useEffect(() => {
    if (mobileSheet) setSelecting(null);
  }, [mobileSheet]);

  if (!isMobile) return null;

  const message = mobileActionMessage;
  const isAssistant = mobileSheet?.role === 'assistant';
  const isEditingThis = !!message && editingId === message.id;
  // A canned greeting was never generated: nothing to edit, redo or branch from.
  const canned = !!message?.tutorWelcome;
  // Headed, like a chat's sheet, by what it acts on: the message's opening
  // words, in the voice they were written in.
  const excerpt = message?.content ? plainExcerpt(message.content) : '';
  const title = (
    <span className={isAssistant ? undefined : 'bottom-sheet__title--voice'}>
      {excerpt || (isAssistant ? 'Reply' : 'Your message')}
    </span>
  );
  // The sheet stays up while the versions turn, its title following the words.
  const versions = message && isAssistant && canSwitchVersion ? versionCount(message) : 1;
  const shown = message ? shownVersionIndex(message) : 0;

  return (
    <>
      <BottomSheet
        open={!!mobileSheet && !selecting}
        label={isAssistant ? 'Reply actions' : 'Message actions'}
        title={title}
        onClose={onClose}
      >
        <SheetItem
          icon={<ClipboardIcon />}
          onClick={async () => {
            if (!mobileSheet) return;
            await onCopy(mobileSheet.id);
            onClose();
          }}
        >
          Copy
        </SheetItem>
        {message?.content && (
          <SheetItem icon={<CursorArrowRaysIcon />} onClick={() => setSelecting(message)}>
            Select text
          </SheetItem>
        )}
        {/* Editing a reply's text reruns nothing; editing a user message reruns its reply. */}
        {message && !canned && (isAssistant || canRedo) && (
          <SheetItem
            icon={<PencilSquareIcon />}
            disabled={isEditingThis}
            onClick={() => {
              onStartEditing(message.id);
              onClose();
            }}
          >
            {isEditingThis ? 'Editing…' : 'Edit'}
          </SheetItem>
        )}
        {isAssistant && mobileSheet && !canned && (
          <>
            {canRedo && (
              <SheetItem
                icon={<ArrowPathIcon />}
                onClick={() => {
                  onRegenerate(mobileSheet.id);
                  onClose();
                }}
              >
                Try again
              </SheetItem>
            )}
            <SheetItem
              icon={<ArrowUturnRightIcon />}
              disabled={isStreaming}
              onClick={() => {
                onBranch(mobileSheet.id);
                onClose();
              }}
            >
              Branch in a new chat
            </SheetItem>
            {versions > 1 && (
              <>
                <SheetItem
                  icon={<ChevronLeftIcon />}
                  disabled={isStreaming || shown === 0}
                  onClick={() => void showReplyVersion(mobileSheet.id, shown - 1)}
                >
                  Previous version
                </SheetItem>
                <SheetItem
                  icon={<ChevronRightIcon />}
                  disabled={isStreaming || shown === versions - 1}
                  onClick={() => void showReplyVersion(mobileSheet.id, shown + 1)}
                >
                  Next version
                </SheetItem>
                <SheetItem
                  icon={<TrashIcon />}
                  danger
                  disabled={isStreaming}
                  onClick={() => {
                    onDeleteVersion(mobileSheet.id);
                    onClose();
                  }}
                >
                  Delete version {shown + 1} of {versions}
                </SheetItem>
              </>
            )}
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!selecting}
        label="Select text"
        title="Select text"
        onClose={() => {
          setSelecting(null);
          onClose();
        }}
      >
        {/* A reply as it reads, set in its own type; your words as typed. */}
        {selecting?.role === 'assistant' ? (
          <div className="select-text is-reply">
            <Markdown content={selecting.content} />
          </div>
        ) : (
          <div className="select-text">{selecting?.content}</div>
        )}
      </BottomSheet>
    </>
  );
}
