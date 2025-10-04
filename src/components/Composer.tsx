'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  EyeIcon,
  MicrophoneIcon,
  PhotoIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { estimateTokens } from '@/lib/tokenEstimate';
import { computeCost } from '@/lib/cost';
import {
  findModelById,
  isReasoningSupported,
  isVisionSupported,
  isAudioInputSupported,
  isImageOutputSupported,
} from '@/lib/models';
import type { Attachment } from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import AttachmentPreviewList from '@/components/AttachmentPreviewList';
import ComposerInput from '@/components/composer/ComposerInput';
import ComposerActions from '@/components/composer/ComposerActions';
import type { Effort } from '@/components/composer/ComposerMobileMenu';
// PDFs are sent directly to OpenRouter as file blocks; no local parsing.

export default function Composer({
  variant = 'sticky',
  keyboardMetrics,
}: {
  variant?: 'sticky' | 'hero';
  keyboardMetrics: KeyboardMetrics;
}) {
  const send = useChatStore((s) => s.sendUserMessage);
  const newChat = useChatStore((s) => s.newChat);
  // DeepResearch works as a toggle like web search; handled in sendUserMessage
  const { chats, selectedChatId } = useChatStore(
    (s) => ({ chats: s.chats, selectedChatId: s.selectedChatId }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const models = useChatStore((s) => s.models);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // No local PDF parsing; keep state simple
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);
  const updateSettings = useChatStore((s) => s.updateChatSettings);
  const setUI = useChatStore((s) => s.setUI);
  const uiNext = useChatStore(
    (s) => ({
      nextTutorMode: s.ui.nextTutorMode,
      nextSearchWithBrave: s.ui.nextSearchWithBrave,
      nextSearchProvider: s.ui.nextSearchProvider,
      nextModel: s.ui.nextModel,
      nextReasoningEffort: s.ui.nextReasoningEffort,
      nextReasoningTokens: s.ui.nextReasoningTokens,
    }),
    shallow,
  );
  const [focused, setFocused] = useState(false);
  const isCompact = useIsMobile();
  const isTablet = useIsMobile(768);
  const [composerHeight, setComposerHeight] = useState(0);
  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.experimentalTutor);
  const forceTutorMode = useChatStore((s) => !!s.ui.forceTutorMode);
  const tutorEnabled =
    tutorGloballyEnabled &&
    (forceTutorMode || !!(chat ? chat.settings.tutor_mode : uiNext.nextTutorMode));

  // Slash commands: /model id, /search on|off|toggle, /reasoning none|low|medium|high
  const trySlashCommand = async (raw: string): Promise<boolean> => {
    const s = (raw || '').trim();
    if (!s.startsWith('/')) return false;
    const parts = s.slice(1).split(/\s+/);
    const cmd = (parts.shift() || '').toLowerCase();
    const arg = parts.join(' ').trim();
    const applyToChat = !!chat;

    const currentModelId = chat?.settings.model || uiNext.nextModel || DEFAULT_MODEL_ID;
    const currentModel = findModelById(models, currentModelId);

    const setNotice = (msg: string) => setUI({ notice: msg });

    if (cmd === 'search' || cmd === 'web') {
      let on: boolean | undefined;
      if (arg === 'on') on = true;
      else if (arg === 'off') on = false;
      else if (arg === 'toggle' || arg === '')
        on = undefined; // toggle
      else return false;
      if (applyToChat) {
        const next = on == null ? !chat!.settings.search_with_brave : on;
        await updateSettings({ search_with_brave: next });
        setNotice(`Web search: ${next ? 'On' : 'Off'}`);
      } else {
        const prev = !!uiNext.nextSearchWithBrave;
        const next = on == null ? !prev : on;
        setUI({ nextSearchWithBrave: next });
        setNotice(`Web search (next): ${next ? 'On' : 'Off'}`);
      }
      return true;
    }

    if (cmd === 'reasoning' || cmd === 'think') {
      const allowed = ['none', 'low', 'medium', 'high'] as const;
      const pick = (arg || '').toLowerCase();
      if (!allowed.includes(pick as any)) return false;
      const supported = isReasoningSupported(currentModel);
      if (!supported) {
        setNotice('Reasoning not supported by current model');
        return true;
      }
      if (applyToChat) await updateSettings({ reasoning_effort: pick as any });
      else setUI({ nextReasoningEffort: pick as any });
      setNotice(`Reasoning effort: ${pick}`);
      return true;
    }

    if (cmd === 'model' || cmd === 'm') {
      const id = arg.trim();
      if (!id) return false;
      // Accept exact id or exact name match (case-insensitive)
      const byId = findModelById(models, id);
      const byName = models.find((m) => m.name?.toLowerCase() === id.toLowerCase());
      const chosen = byId || byName;
      if (!chosen) {
        setNotice(`Unknown model: ${id}`);
        return true;
      }
      if (applyToChat) await updateSettings({ model: chosen.id });
      else setUI({ nextModel: chosen.id });
      setNotice(`Model set to ${chosen.name || chosen.id}`);
      return true;
    }

    if (cmd === 'help') {
      setNotice('Slash: /model <id>, /search on|off|toggle, /reasoning none|low|medium|high');
      return true;
    }

    return false;
  };

  const onSend = async () => {
    const value = text.trim();
    if (!value) return;
    // Handle slash commands locally
    if (value.startsWith('/')) {
      const handled = await trySlashCommand(value);
      if (handled) {
        setText('');
        taRef.current?.focus();
        return;
      }
    }
    setText('');
    const toSend = attachments.slice();
    setAttachments([]);
    // On mobile, blur to close the keyboard; on desktop keep focus for fast follow-ups
    if (isTablet) taRef.current?.blur();
    else taRef.current?.focus();
    if (!chat) await newChat();
    await send(value, { attachments: toSend });
  };

  // DeepResearch toggles like web search; actual call happens on send

  // Autofocus on mount and when chat changes or streaming stops
  const canAutoFocus = !isTablet;

  useEffect(() => {
    if (canAutoFocus) {
      taRef.current?.focus({ preventScroll: true } as any);
    } else {
      taRef.current?.blur();
    }
  }, []);
  useEffect(() => {
    if (canAutoFocus) {
      taRef.current?.focus({ preventScroll: true } as any);
    } else {
      taRef.current?.blur();
    }
  }, [selectedChatId]);
  useEffect(() => {
    if (!isStreaming && canAutoFocus) {
      taRef.current?.focus({ preventScroll: true } as any);
    }
  }, [isStreaming]);

  const maxTextareaHeight = useMemo(() => {
    // Use a stable fallback so SSR and first client render match before we measure
    const viewport =
      keyboardMetrics?.viewportHeight && keyboardMetrics.viewportHeight > 0
        ? keyboardMetrics.viewportHeight
        : 720;
    const capped = Math.min(320, Math.max(180, viewport * 0.35));
    return Math.round(capped);
  }, [keyboardMetrics?.viewportHeight]);

  useAutogrowTextarea(taRef, [text], maxTextareaHeight);

  // Lightweight, live prompt token and cost estimate
  const tokenAndCost = useMemo(() => {
    const promptTokens = estimateTokens(text) || 0;
    const mid = chat?.settings.model || uiNext.nextModel || DEFAULT_MODEL_ID;
    const modelMeta = findModelById(models, mid);
    const cost = computeCost({ model: modelMeta, promptTokens });
    return { promptTokens, currency: cost.currency, total: cost.total };
  }, [text, chat?.settings.model, uiNext.nextModel, models]);

  const modelId = chat?.settings.model || uiNext.nextModel || DEFAULT_MODEL_ID;
  const modelMeta = findModelById(models, modelId);
  const canVision = isVisionSupported(modelMeta);
  const canAudio = isAudioInputSupported(modelMeta);
  const supportsReasoning = isReasoningSupported(modelMeta);
  const canImageOut = isImageOutputSupported(modelMeta);
  const braveGloballyEnabled = useChatStore((s) => !!s.ui.experimentalBrave);
  const searchEnabled = chat ? !!chat.settings.search_with_brave : !!uiNext.nextSearchWithBrave;
  const rawProvider =
    (chat?.settings as any)?.search_provider || uiNext.nextSearchProvider || 'brave';
  const searchProvider: 'brave' | 'openrouter' = braveGloballyEnabled ? rawProvider : 'openrouter';
  const currentEffort = (
    chat
      ? (chat.settings.reasoning_effort as Effort | undefined)
      : (uiNext.nextReasoningEffort as Effort | undefined)
  ) as Effort | undefined;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFilesChosen = async (files: FileList | File[]) => {
    if (!canVision) return;
    const toProcess = clampImages(attachments.filter((a) => a.kind === 'image').length, files);
    const next: Attachment[] = [];
    for (const f of toProcess) {
      const att = await toImageAttachment(f);
      if (att) next.push(att);
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  const onPdfChosen = async (files: FileList | File[]) => {
    const arr = Array.from(files || []);
    const maxDocs = 2;
    const existingDocs = attachments.filter((a) => a.kind === 'pdf').length;
    const remain = Math.max(0, maxDocs - existingDocs);
    const toProcess = arr.slice(0, remain);
    const next: Attachment[] = [];
    for (const f of toProcess) {
      const att = await toPdfAttachment(f);
      if (att) next.push(att);
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items || [];
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      const pdfs = files.filter((f) => f.type === 'application/pdf');
      const imgs = files.filter((f) => f.type.startsWith('image/'));
      if (imgs.length && canVision) await onFilesChosen(imgs);
      if (pdfs.length) await onPdfChosen(pdfs);
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      const arr = Array.from(files);
      const pdfs = arr.filter((f) => f.type === 'application/pdf');
      const imgs = arr.filter((f) => f.type.startsWith('image/'));
      const auds = arr.filter(
        (f) =>
          f.type.startsWith('audio/') ||
          f.name.toLowerCase().endsWith('.wav') ||
          f.name.toLowerCase().endsWith('.mp3'),
      );
      if (imgs.length && canVision) await onFilesChosen(imgs);
      if (pdfs.length) await onPdfChosen(pdfs);
      if (auds.length && canAudio) await onAudioChosen(auds);
    }
  };

  const onAudioChosen = async (files: FileList | File[]) => {
    const arr = Array.from(files || []);
    const maxAud = 1;
    const existingAud = attachments.filter((a) => a.kind === 'audio').length;
    const remain = Math.max(0, maxAud - existingAud);
    const toProcess = arr.slice(0, remain);
    const next: Attachment[] = [];
    for (const f of toProcess) {
      const att = await toAudioAttachment(f);
      if (att) next.push(att);
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  const shouldPinToViewport =
    isCompact && variant !== 'hero' && (focused || keyboardMetrics.offset > 0);
  const wrapperClass =
    variant === 'hero'
      ? 'composer-hero'
      : `composer-chrome${shouldPinToViewport ? ' is-mobile-pinned' : ''}`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!isCompact) {
      root.classList.remove('keyboard-active');
      return () => {
        root.classList.remove('keyboard-active');
      };
    }
    if (shouldPinToViewport) root.classList.add('keyboard-active');
    else root.classList.remove('keyboard-active');
    return () => {
      root.classList.remove('keyboard-active');
    };
  }, [isCompact, shouldPinToViewport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (variant === 'hero') {
      document.documentElement.style.setProperty('--composer-height', '0px');
      setComposerHeight((prev) => (prev === 0 ? prev : 0));
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const el = wrapperRef.current;
    if (!el) return;

    const applyHeight = () => {
      const h = Math.round(el.offsetHeight);
      document.documentElement.style.setProperty('--composer-height', `${h}px`);
      setComposerHeight((prev) => (prev === h ? prev : h));
    };
    applyHeight();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--composer-height', '0px');
      setComposerHeight((prev) => (prev === 0 ? prev : 0));
    };
  }, [variant]);

  const isHeroVariant = variant === 'hero';

  const attachmentsHint =
    canVision && canAudio
      ? 'Attach images, audio (mp3/wav), or PDFs'
      : canVision
        ? 'Attach images or PDFs'
        : canAudio
          ? 'Attach audio (mp3/wav) or PDFs'
          : 'Attach PDFs';

  const showReasoningMenu = supportsReasoning && !tutorEnabled;
  const toggleSearch = () => {
    if (chat) {
      void updateSettings({ search_with_brave: !chat.settings.search_with_brave });
    } else {
      setUI({ nextSearchWithBrave: !uiNext.nextSearchWithBrave });
    }
  };

  const handleSelectEffort = async (effort: Effort) => {
    if (chat) await updateSettings({ reasoning_effort: effort });
    else setUI({ nextReasoningEffort: effort });
  };

  const handleStop = () => {
    stop();
    if (!isTablet) setTimeout(() => taRef.current?.focus({ preventScroll: true } as any), 0);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <>
      {shouldPinToViewport && composerHeight > 0 && !isHeroVariant && (
        <div
          className="composer-placeholder"
          aria-hidden="true"
          style={{ height: `${composerHeight}px` }}
        />
      )}
      <div
        ref={wrapperRef}
        className={wrapperClass}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <AttachmentPreviewList
          attachments={attachments}
          onRemove={(id) =>
            setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/wav,audio/mpeg"
          multiple
          className="hidden"
          onChange={async (event) => {
            const inputEl = event.currentTarget;
            const files = inputEl?.files;
            if (files) {
              const arr = Array.from(files);
              const pdfs = arr.filter((f) => f.type === 'application/pdf');
              const imgs = arr.filter((f) => f.type.startsWith('image/'));
              const auds = arr.filter(
                (f) =>
                  f.type.startsWith('audio/') ||
                  f.name.toLowerCase().endsWith('.wav') ||
                  f.name.toLowerCase().endsWith('.mp3'),
              );
              if (pdfs.length) await onPdfChosen(pdfs);
              if (imgs.length && canVision) await onFilesChosen(imgs);
              if (auds.length && canAudio) await onAudioChosen(auds);
            }
            if (inputEl) inputEl.value = '';
          }}
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
            onPaste={onPaste}
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
        {/* Helper chips row: current model, capabilities, web search, reasoning, token estimate */}
        {/* Hide helper chips on small screens to reduce clutter */}
        <div className="mt-2 hidden sm:flex items-center gap-2 flex-wrap text-xs">
          {
            <button
              className="badge"
              title="Change model (opens Settings)"
              onClick={() => setUI({ showSettings: true })}
            >
              {tutorEnabled ? 'Tutor' : findModelById(models, modelId)?.name || modelId}
            </button>
          }
          {canVision && (
            <span
              className="badge flex items-center gap-1"
              title="Vision input supported"
              aria-label="Vision supported"
            >
              <EyeIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {canImageOut && (
            <span
              className="badge flex items-center gap-1"
              title="Image generation supported"
              aria-label="Image generation supported"
            >
              <PhotoIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {canAudio && (
            <span
              className="badge flex items-center gap-1"
              title="Audio input supported (mp3/wav)"
              aria-label="Audio input supported"
            >
              <MicrophoneIcon className="h-3.5 w-3.5" />
            </span>
          )}
          <button
            className="badge flex items-center gap-1"
            title={`Toggle ${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} web search for next message`}
            onClick={toggleSearch}
            aria-pressed={!!searchEnabled}
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5" />{' '}
            {(searchProvider === 'openrouter' ? 'OR' : 'Brave') +
              ' ' +
              (searchEnabled ? 'On' : 'Off')}
          </button>
          {!tutorEnabled &&
            (() => {
              const effort = currentEffort;
              if (!supportsReasoning) return null;
              if (!effort || effort === 'none') return null;
              const letter = effort === 'high' ? 'H' : effort === 'medium' ? 'M' : 'L';
              return (
                <span
                  className="badge flex items-center gap-1"
                  title={`Reasoning effort: ${effort}`}
                  aria-label={`Reasoning ${effort}`}
                >
                  <LightBulbIcon className="h-3.5 w-3.5" /> {letter}
                </span>
              );
            })()}
          <span className="text-xs text-muted-foreground">
            Press Enter to send · Shift+Enter for newline
          </span>
        </div>
      </div>
    </>
  );
}
import {
  toImageAttachment,
  toPdfAttachment,
  toAudioAttachment,
  clampImages,
} from '@/lib/attachments';
