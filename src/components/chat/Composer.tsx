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
} from '@/lib/models';
import { useTierDefaultModelId } from '@/lib/hooks/useTierModels';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import type { UiNextOverrides } from '@/lib/contracts/ui';
import { AttachmentPreviewList } from '@/components/AttachmentPreviewList';
import { ComposerInput } from '@/components/composer/ComposerInput';
import { ComposerActions } from '@/components/composer/ComposerActions';
import type { Effort } from '@/components/composer/ComposerMobileMenu';
import { useComposerAttachments } from '@/lib/hooks/useComposerAttachments';
import { useComposerShortcuts } from '@/lib/hooks/useComposerShortcuts';
import { ComposerLayout } from '@/components/composer/ComposerLayout';
import {
  selectIsStreaming,
  selectIsTutorEnabled,
  selectResolvedModelId,
  selectResolvedTurnSettings,
  selectSearchEnabled,
  selectSearchProvider,
} from '@/lib/store/selectors';

const EMPTY_OVERRIDES: UiNextOverrides = {};

export function Composer({
  variant = 'sticky',
  keyboardMetrics,
}: {
  variant?: 'sticky' | 'hero';
  keyboardMetrics: KeyboardMetrics;
}) {
  const {
    send,
    newChat,
    chats,
    selectedChatId,
    models,
    isStreaming,
    stop,
    updateSettings,
    setUI,
    setNotice,
    overrides,
    composerDraft,
  } = useChatStore(
    (s) => ({
      send: s.sendUserMessage,
      newChat: s.newChat,
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      models: s.models,
      isStreaming: selectIsStreaming(s),
      stop: s.stopStreaming,
      updateSettings: s.updateChatSettings,
      setUI: s.setUI,
      setNotice: s.setNotice,
      overrides: s.ui.overrides,
      composerDraft: s.ui.composerDraft,
    }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const uiNext = useMemo(() => overrides ?? EMPTY_OVERRIDES, [overrides]);
  const [focused, setFocused] = useState(false);
  const isTablet = useIsMobile(768);
  const isMobile = useIsMobile(640);
  const tutorEnabled = useChatStore(selectIsTutorEnabled);
  const searchEnabled = useChatStore(selectSearchEnabled);
  const searchProvider = useChatStore(selectSearchProvider);
  const resolvedTurnSettings = useChatStore(selectResolvedTurnSettings);

  // Sync focus state to store for mobile tab bar visibility
  useEffect(() => {
    if (isMobile) {
      setUI({ mobile: { composerFocused: focused } });
    }
  }, [focused, isMobile, setUI]);

  // Consume pending composer draft from store (e.g., from quick start buttons)
  useEffect(() => {
    if (composerDraft) {
      setText(composerDraft);
      setUI({ composerDraft: undefined });
      // Focus the textarea after filling
      setTimeout(() => taRef.current?.focus(), 0);
    }
  }, [composerDraft, setUI]);

  const tierDefaultModelId = useTierDefaultModelId();
  const modelId = useChatStore(
    useMemo(() => selectResolvedModelId(tierDefaultModelId), [tierDefaultModelId]),
  );
  const modelMeta = findModelById(models, modelId);
  const canVision = isVisionSupported(modelMeta);
  const canAudio = isAudioInputSupported(modelMeta);
  const supportsReasoning = isReasoningSupported(modelMeta);

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
    setNotice,
    newChat,
    sendMessage: (value, options) => send(value, options),
    defaultModelId: tierDefaultModelId,
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
      target.focus({ preventScroll: true });
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
  }, [keyboardMetrics]);

  useAutogrowTextarea(taRef, [text], maxTextareaHeight);

  const currentEffort = (resolvedTurnSettings?.generation.reasoningEffort ??
    (uiNext.reasoning?.effort as Effort | undefined)) as Effort | undefined;

  const showReasoningMenu = supportsReasoning && !tutorEnabled;
  const toggleSearch = () => {
    if (chat) {
      void updateSettings({
        features: { search: { enabled: !chat.settings.features.search.enabled } },
      });
    } else {
      setUI({
        overrides: { search: { enabled: !uiNext.search?.enabled } },
      });
    }
  };

  const handleSelectEffort = async (effort: Effort) => {
    if (chat) await updateSettings({ generation: { reasoningEffort: effort } });
    else setUI({ overrides: { reasoning: { effort } } });
  };

  const handleStop = () => {
    stop();
    if (!isTablet) setTimeout(() => taRef.current?.focus({ preventScroll: true }), 0);
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

      <div className="composer-row">
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
          hasContent={text.trim().length > 0 || attachments.length > 0}
        />
      </div>
    </ComposerLayout>
  );
}
