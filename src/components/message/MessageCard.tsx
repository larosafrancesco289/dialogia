'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { useMessageCardController } from '@/components/message/useMessageCardController';
import { MessageCardView, type MessageCardViewData } from '@/components/message/MessageCardView';

export type MessageCardProps = {
  chatId: string;
  messageId: string;
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string, content: string) => void;
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
  showReasoningByDefault: boolean;
  isStreaming: boolean;
  isChatStreaming: boolean;
  onOpenMobileSheet: (value: { id: string; role: 'assistant' | 'user' }) => void;
  onBranch: (messageId: string) => void;
  onRegenerate: (messageId: string, modelId?: string) => void;
};

function MessageCardComponent({
  chatId,
  messageId,
  isMobile,
  isActive,
  showInlineActions,
  isEditing,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  showReasoningByDefault,
  isStreaming,
  isChatStreaming,
  onOpenMobileSheet,
  onBranch,
  onRegenerate,
}: MessageCardProps) {
  const viewModel = useMessageCardController({ chatId, messageId });
  const { message } = viewModel;
  const [draft, setDraft] = useState('');
  const prevEditingRef = useRef(isEditing);
  const [reasoningOverride, setReasoningOverride] = useState<boolean | null>(null);
  const reasoningExpanded = reasoningOverride ?? showReasoningByDefault;
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  useEffect(() => {
    const wasEditing = prevEditingRef.current;
    prevEditingRef.current = isEditing;
    if (isEditing && !wasEditing) {
      setDraft(message?.content || '');
    } else if (!isEditing && wasEditing) {
      setDraft('');
    }
  }, [isEditing, message?.content]);

  const handleCopy = useCallback(() => copyMessage(messageId), [copyMessage, messageId]);
  const handleStartEdit = useCallback(
    () => startEditingMessage(messageId),
    [messageId, startEditingMessage],
  );
  const handleSaveEdit = useCallback(
    () => saveEdit(messageId, draft),
    [messageId, saveEdit, draft],
  );
  const handleBranch = useCallback(() => onBranch(messageId), [messageId, onBranch]);
  const handleRegenerate = useCallback(
    (modelId?: string) => onRegenerate(messageId, modelId),
    [messageId, onRegenerate],
  );

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
    isStreaming,
    isChatStreaming,
    panels: {
      sources: {
        expanded: sourcesExpanded,
        onToggle: () => setSourcesExpanded((prev) => !prev),
      },
      debug: {
        expanded: debugExpanded,
        onToggle: () => setDebugExpanded((prev) => !prev),
      },
      reasoning: {
        expanded: reasoningExpanded,
        onToggle: () => setReasoningOverride((prev) => !(prev ?? showReasoningByDefault)),
      },
      stats: {
        expanded: statsExpanded,
        onToggle: () => setStatsExpanded((prev) => !prev),
      },
    },
    onBranch: handleBranch,
    onChooseRegenerateModel: handleRegenerate,
    onPointerDown: longPress.onPointerDown,
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
  };

  return <MessageCardView viewModel={cardViewModel} />;
}

export const MessageCard = memo(MessageCardComponent);
