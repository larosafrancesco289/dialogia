'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import {
  findModelById,
  isReasoningSupported,
  isVisionSupported,
  isAudioInputSupported,
  isImageOutputSupported,
} from '@/lib/models';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { readNextOverrides } from '@/lib/ui/next';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { AttachmentPreviewList } from '@/components/AttachmentPreviewList';
import { ComposerInput } from '@/components/composer/ComposerInput';
import { ComposerActions } from '@/components/composer/ComposerActions';
import type { Effort } from '@/components/composer/ComposerMobileMenu';
import { getNextNode } from '@/lib/learningPlan/service';
import { useComposerAttachments } from '@/lib/hooks/useComposerAttachments';
import { useComposerShortcuts } from '@/lib/hooks/useComposerShortcuts';
import { ComposerChips } from '@/components/composer/ComposerChips';
import { ComposerLayout } from '@/components/composer/ComposerLayout';

export function Composer({
  variant = 'sticky',
  keyboardMetrics,
}: {
  variant?: 'sticky' | 'hero';
  keyboardMetrics: KeyboardMetrics;
}) {
  const send = useChatStore((s) => s.sendUserMessage);
  const newChat = useChatStore((s) => s.newChat);
  const { chats, selectedChatId } = useChatStore(
    (s) => ({ chats: s.chats, selectedChatId: s.selectedChatId }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const models = useChatStore((s) => s.models);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);
  const updateSettings = useChatStore((s) => s.updateChatSettings);
  const setUI = useChatStore((s) => s.setUI);
  const uiNext = useChatStore((s) => readNextOverrides(s.ui));
  const [focused, setFocused] = useState(false);
  const isTablet = useIsMobile(768);

  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.experimentalTutor);
  const forceTutorMode = useChatStore((s) => !!s.ui.forceTutorMode);
  const tutorEnabled =
    tutorGloballyEnabled &&
    (forceTutorMode || !!(chat ? chat.settings.tutor_mode : uiNext.tutorMode));

  const learningPlan = chat?.settings?.learningPlan;
  const currentNode = useMemo(
    () => (learningPlan ? getNextNode(learningPlan) : null),
    [learningPlan],
  );

  const modelId = chat?.settings.model || uiNext.model || DEFAULT_MODEL_ID;
  const modelMeta = findModelById(models, modelId);
  const canVision = isVisionSupported(modelMeta);
  const canAudio = isAudioInputSupported(modelMeta);
  const supportsReasoning = isReasoningSupported(modelMeta);
  const canImageOut = isImageOutputSupported(modelMeta);

  const {
    attachments,
    attachmentsHint,
    fileInputRef,
    handleFileInputChange,
    handlePaste,
    handleDrop,
    openFilePicker,
    removeAttachment,
    resetAttachments,
  } = useComposerAttachments({ canVision, canAudio });

  const { handleSubmit } = useComposerShortcuts({
    chat,
    models,
    nextOverrides: uiNext,
    updateChatSettings: updateSettings,
    setUI,
    newChat,
    sendMessage: (value, options) => send(value, options),
  });

  const onSend = async () => {
    const result = await handleSubmit({
      text,
      attachments: attachments.slice(),
      onBeforeSend: () => {
        setText('');
        resetAttachments();
        if (isTablet) taRef.current?.blur();
        else taRef.current?.focus();
      },
      onCommandHandled: () => {
        setText('');
        taRef.current?.focus();
      },
    });
    if (result === 'noop') return;
  };

  const canAutoFocus = !isTablet;

  useEffect(() => {
    const target = taRef.current;
    if (!target) return;
    if (canAutoFocus && !isStreaming) {
      target.focus({ preventScroll: true } as any);
    } else {
      target.blur();
    }
  }, [canAutoFocus, isStreaming, selectedChatId]);

  const maxTextareaHeight = useMemo(() => {
    const viewport =
      keyboardMetrics?.viewportHeight && keyboardMetrics.viewportHeight > 0
        ? keyboardMetrics.viewportHeight
        : 720;
    const capped = Math.min(320, Math.max(180, viewport * 0.35));
    return Math.round(capped);
  }, [keyboardMetrics?.viewportHeight]);

  useAutogrowTextarea(taRef, [text], maxTextareaHeight);

  const experimentalBrave = useChatStore((s) => !!s.ui.experimentalBrave);
  const searchEnabled = chat ? !!chat.settings.search_enabled : !!uiNext.search?.enabled;
  const rawProvider =
    (chat?.settings as any)?.search_provider || uiNext.search?.provider || 'openrouter';
  const searchProvider: 'brave' | 'openrouter' =
    experimentalBrave && rawProvider === 'brave' ? 'brave' : 'openrouter';
  const currentEffort = (
    chat
      ? (chat.settings.reasoning_effort as Effort | undefined)
      : (uiNext.reasoning?.effort as Effort | undefined)
  ) as Effort | undefined;

  const showReasoningMenu = supportsReasoning && !tutorEnabled;
  const toggleSearch = () => {
    if (chat) {
      void updateSettings({ search_enabled: !chat.settings.search_enabled });
    } else {
      setUI({
        next: { search: { enabled: !uiNext.search?.enabled } },
      });
    }
  };

  const handleSelectEffort = async (effort: Effort) => {
    if (chat) await updateSettings({ reasoning_effort: effort });
    else setUI({ next: { reasoning: { effort } } });
  };

  const handleStop = () => {
    stop();
    if (!isTablet) setTimeout(() => taRef.current?.focus({ preventScroll: true } as any), 0);
  };

  return (
    <ComposerLayout
      variant={variant}
      keyboardMetrics={keyboardMetrics}
      focused={focused}
      onDrop={handleDrop}
    >
      <AttachmentPreviewList attachments={attachments} onRemove={removeAttachment} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/wav,audio/mpeg"
        multiple
        className="hidden"
        onChange={(event) => handleFileInputChange(event.currentTarget)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ComposerInput
          value={text}
          onChange={setText}
          onSend={onSend}
          isStreaming={isStreaming}
          textareaRef={taRef}
          maxHeight={maxTextareaHeight}
          models={models}
          onPaste={handlePaste}
          onFocusChange={setFocused}
        />
        <ComposerActions
          isStreaming={isStreaming}
          onStop={handleStop}
          onSend={onSend}
          openFilePicker={openFilePicker}
          attachmentsHint={attachmentsHint}
          searchEnabled={searchEnabled}
          searchProvider={searchProvider}
          toggleSearch={toggleSearch}
          showReasoningMenu={showReasoningMenu}
          currentEffort={currentEffort}
          onSelectEffort={handleSelectEffort}
        />
      </div>
      <ComposerChips
        tutorEnabled={tutorEnabled}
        modelId={modelId}
        models={models}
        openSettings={() => setUI({ showSettings: true })}
        currentNode={currentNode}
        canVision={canVision}
        canImageOut={canImageOut}
        canAudio={canAudio}
        searchProvider={searchProvider}
        searchEnabled={searchEnabled}
        toggleSearch={toggleSearch}
        supportsReasoning={supportsReasoning}
        currentEffort={currentEffort}
      />
    </ComposerLayout>
  );
}