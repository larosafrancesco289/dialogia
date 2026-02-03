'use client';
import { memo, useCallback } from 'react';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { useMessageCardController } from '@/components/message/useMessageCardController';
import type { MessagePanelState } from '@/components/message/hooks/useMessagePanels';
import { MessageCardView, type MessageCardViewData } from '@/components/message/MessageCardView';

export type MessageCardProps = {
  chatId: string;
  messageId: string;
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string) => void;
  startEditingMessage: (messageId: string) => void;
  copyMessage: (messageId: string) => Promise<void> | void;
  copiedId: string | null;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  waitingForFirstToken: boolean;
  lastMessageId?: string;
  panels: MessagePanelState;
  onOpenMobileSheet: (value: { id: string; role: 'assistant' | 'user' }) => void;
};

function MessageCardComponent({
  chatId,
  messageId,
  isMobile,
  isActive,
  showInlineActions,
  isEditing,
  draft,
  setDraft,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  panels,
  onOpenMobileSheet,
}: MessageCardProps) {
  const viewModel = useMessageCardController({ chatId, messageId });
  const { message } = viewModel;

  const handleCopy = useCallback(() => copyMessage(messageId), [copyMessage, messageId]);
  const handleStartEdit = useCallback(
    () => startEditingMessage(messageId),
    [messageId, startEditingMessage],
  );
  const handleSaveEdit = useCallback(() => saveEdit(messageId), [messageId, saveEdit]);

  const longPress = useLongPressSheet({
    enabled: isMobile && !!message,
    onLongPress: () => {
      if (message) {
        onOpenMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
      }
    },
  });

  const cardViewModel: MessageCardViewData = {
    ...viewModel,
    chatId,
    messageId,
    isMobile,
    isActive,
    showInlineActions,
    isEditing,
    draft,
    setDraft,
    setEditingId,
    onSaveEdit: handleSaveEdit,
    onStartEdit: handleStartEdit,
    onCopy: handleCopy,
    copiedId,
    setLightbox,
    waitingForFirstToken,
    lastMessageId,
    panels,
    onPointerDown: longPress.onPointerDown,
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
  };

  return <MessageCardView viewModel={cardViewModel} />;
}

export const MessageCard = memo(MessageCardComponent);
