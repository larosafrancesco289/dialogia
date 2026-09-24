import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message } from '@/lib/types';
import { copyText } from '@/lib/clipboard';

type MobileSheetState = { id: string; role: 'assistant' | 'user' };

export function useMessageListController(args: {
  messages: Message[];
  isStreaming: boolean;
  isMobile: boolean;
  editUserMessage: (
    messageId: string,
    content: string,
    opts?: { rerun?: boolean },
  ) => Promise<void>;
  editAssistantMessage: (messageId: string, content: string) => Promise<void>;
  branchFrom: (messageId: string) => void;
  regenerate: (messageId: string, opts?: { modelId?: string }) => void;
}) {
  const {
    messages,
    isStreaming,
    isMobile,
    editUserMessage,
    editAssistantMessage,
    branchFrom,
    regenerate,
  } = args;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetState | null>(null);

  const openMobileSheet = useCallback((value: MobileSheetState) => {
    setActiveMessageId(value.id);
    setMobileSheet(value);
  }, []);

  const closeMobileSheet = useCallback(() => {
    setMobileSheet(null);
    setActiveMessageId(null);
  }, []);

  const saveEdit = useCallback(
    (messageId: string, content: string) => {
      const text = content.trim();
      if (!text) return;
      const payload = content;
      setEditingId(null);
      const role = messages.find((mm) => mm.id === messageId)?.role;
      if (role === 'assistant') {
        editAssistantMessage(messageId, payload).catch(() => void 0);
      } else {
        editUserMessage(messageId, payload, { rerun: true }).catch(() => void 0);
      }
    },
    [editAssistantMessage, editUserMessage, messages],
  );

  const copyMessage = useCallback(
    async (messageId: string) => {
      const msg = messages.find((x) => x.id === messageId);
      if (!msg) return;
      if (!(await copyText(msg.content || ''))) return;
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((id) => (id === messageId ? null : id)), 1200);
    },
    [messages],
  );

  const startEditingMessage = useCallback(
    (messageId: string) => {
      const msg = messages.find((x) => x.id === messageId);
      if (!msg) return;
      setEditingId(messageId);
    },
    [messages],
  );

  const editPreviousUserMessage = useCallback(
    (assistantMessageId: string) => {
      const idx = messages.findIndex((x) => x.id === assistantMessageId);
      if (idx === -1) return;
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') {
          // A ledger line records a click, not words; there is nothing to reword.
          if (!messages[i].ledger) setEditingId(messages[i].id);
          return;
        }
      }
    },
    [messages],
  );

  const branchFromMessage = useCallback(
    (messageId: string) => {
      if (isStreaming) return;
      branchFrom(messageId);
    },
    [branchFrom, isStreaming],
  );

  const regenerateMessage = useCallback(
    (messageId: string, modelId?: string) => {
      regenerate(messageId, modelId ? { modelId } : undefined);
    },
    [regenerate],
  );

  const mobileActionMessage = useMemo(() => {
    if (!mobileSheet) return null;
    return messages.find((msg) => msg.id === mobileSheet.id) ?? null;
  }, [mobileSheet, messages]);

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMobileSheet();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobile, mobileSheet, closeMobileSheet]);

  useEffect(() => {
    if (!mobileSheet) return;
    const exists = messages.some((msg) => msg.id === mobileSheet.id);
    if (!exists) closeMobileSheet();
  }, [mobileSheet, messages, closeMobileSheet]);

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (activeMessageId === mobileSheet.id) return;
    setActiveMessageId(mobileSheet.id);
  }, [isMobile, mobileSheet, activeMessageId]);

  useEffect(() => {
    if (!isMobile) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!activeMessageId) return;
      const target = e.target as Element | null;
      if (!target) return;
      const withinActive = target.closest(`[data-mid="${activeMessageId}"]`);
      if (withinActive) return;
      setActiveMessageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMobile, activeMessageId]);

  return {
    copiedId,
    editingId,
    setEditingId,
    saveEdit,
    startEditingMessage,
    editPreviousUserMessage,
    copyMessage,
    branchFromMessage,
    regenerateMessage,
    mobileSheet,
    openMobileSheet,
    closeMobileSheet,
    mobileActionMessage,
    activeMessageId,
    setActiveMessageId,
  };
}
