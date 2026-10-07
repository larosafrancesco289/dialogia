import { useEffect, useRef, useState } from 'react';
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
import { useT } from '@/lib/i18n';

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
  const t = useT();
  const [selecting, setSelecting] = useState<Message | null>(null);
  const showReplyVersion = useChatStore((s) => s.showReplyVersion);
  const openedOn = useRef<string | null>(null);

  // A new long press starts on the actions, never on an old selection page.
  useEffect(() => {
    if (!mobileSheet) return;
    openedOn.current = mobileSheet.id;
    setSelecting(null);
  }, [mobileSheet]);

  // The long-pressed message opened the sheet: closing puts focus back on it,
  // so the reader is where they were. It is not a control, so it holds focus
  // (tabIndex -1) only until focus moves on.
  const backToMessage = () => {
    const id = openedOn.current;
    const card = id ? document.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`) : null;
    if (!card || card.hasAttribute('tabindex')) return card;
    card.tabIndex = -1;
    card.addEventListener('blur', () => card.removeAttribute('tabindex'), { once: true });
    return card;
  };

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
      {excerpt || t(isAssistant ? 'message.sheet.reply' : 'message.sheet.yours')}
    </span>
  );
  // The sheet stays up while the versions turn, its title following the words.
  const versions = message && isAssistant && canSwitchVersion ? versionCount(message) : 1;
  const shown = message ? shownVersionIndex(message) : 0;

  return (
    <>
      <BottomSheet
        open={!!mobileSheet && !selecting}
        label={t(isAssistant ? 'message.sheet.replyActions' : 'message.sheet.messageActions')}
        title={title}
        onClose={onClose}
        returnFocus={backToMessage}
      >
        <SheetItem
          icon={<ClipboardIcon />}
          onClick={async () => {
            if (!mobileSheet) return;
            await onCopy(mobileSheet.id);
            onClose();
          }}
        >
          {t('message.copy')}
        </SheetItem>
        {message?.content && (
          <SheetItem icon={<CursorArrowRaysIcon />} onClick={() => setSelecting(message)}>
            {t('message.selectText')}
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
            {t(isEditingThis ? 'message.editing' : 'message.edit')}
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
                {t('message.tryAgain')}
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
              {t('message.branch')}
            </SheetItem>
            {versions > 1 && (
              <>
                <SheetItem
                  icon={<ChevronLeftIcon />}
                  disabled={isStreaming || shown === 0}
                  onClick={() => void showReplyVersion(mobileSheet.id, shown - 1)}
                >
                  {t('versions.previous')}
                </SheetItem>
                <SheetItem
                  icon={<ChevronRightIcon />}
                  disabled={isStreaming || shown === versions - 1}
                  onClick={() => void showReplyVersion(mobileSheet.id, shown + 1)}
                >
                  {t('versions.next')}
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
                  {t('versions.deleteNumbered', { at: shown + 1, count: versions })}
                </SheetItem>
              </>
            )}
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!selecting}
        label={t('message.selectText')}
        title={t('message.selectText')}
        returnFocus={backToMessage}
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
