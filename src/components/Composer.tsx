'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  StopIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  XMarkIcon,
  DocumentTextIcon,
  EyeIcon,
  MicrophoneIcon,
  PhotoIcon,
  LightBulbIcon,
  AcademicCapIcon,
  BeakerIcon,
  PlusIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import ReasoningEffortMenu from '@/components/ReasoningEffortMenu';
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
  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.experimentalTutor);
  const tutorEnabled =
    tutorGloballyEnabled && !!(chat ? chat.settings.tutor_mode : uiNext.nextTutorMode);
  const [slashIndex, setSlashIndex] = useState(0);
  const deepEnabled = useChatStore((s) => !!s.ui.nextDeepResearch);

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
    try {
      const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
      if (isSmall) taRef.current?.blur();
      else taRef.current?.focus();
    } catch {}
    if (!chat) await newChat();
    await send(value, { attachments: toSend });
  };

  // DeepResearch toggles like web search; actual call happens on send

  // Autofocus on mount and when chat changes or streaming stops
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, []);
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, [selectedChatId]);
  useEffect(() => {
    if (!isStreaming) {
      const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
      if (!isSmall) taRef.current?.focus({ preventScroll: true } as any);
    }
  }, [isStreaming]);

  const maxTextareaHeight = useMemo(() => {
    // Use a stable default viewport height to prevent hydration mismatch
    const viewport = keyboardMetrics?.viewportHeight ?? 720;
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
  const rawProvider = (chat?.settings as any)?.search_provider || uiNext.nextSearchProvider || 'brave';
  const searchProvider: 'brave' | 'openrouter' = braveGloballyEnabled ? rawProvider : 'openrouter';
  type Effort = 'none' | 'low' | 'medium' | 'high';
  const currentEffort = (chat
    ? (chat.settings.reasoning_effort as Effort | undefined)
    : (uiNext.nextReasoningEffort as Effort | undefined)) as Effort | undefined;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Build slash command suggestions
  type Suggestion = { title: string; insert: string; subtitle?: string };
  const slashSuggestions: Suggestion[] = useMemo(() => {
    const s = (text || '').trimStart();
    if (!s.startsWith('/')) return [];
    // avoid multi-line triggering
    if (s.includes('\n')) return [];
    const after = s.slice(1);
    const [rawCmd = '', ...rest] = after.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const arg = rest.join(' ').trim();
    const list: Suggestion[] = [];
    const push = (t: string, i: string, sub?: string) =>
      list.push({ title: t, insert: i, subtitle: sub });
    const starts = (a: string, b: string) => a.startsWith(b);

    const allCmds: Array<{ key: string; label: string; help?: string }> = [
      { key: 'model', label: 'model', help: 'Set model by id or name' },
      { key: 'search', label: 'search', help: 'Toggle web search (on/off/toggle)' },
      { key: 'reasoning', label: 'reasoning', help: 'Set reasoning effort' },
      { key: 'help', label: 'help', help: 'Show slash command help' },
    ];

    if (!cmd) {
      for (const c of allCmds) push(`/${c.label}`, `/${c.key} `, c.help);
      return list;
    }

    const matched = allCmds.filter((c) => starts(c.key, cmd));
    if (matched.length > 1 && arg === '') {
      for (const c of matched) push(`/${c.label}`, `/${c.key} `, c.help);
      return list;
    }

    if (cmd === 'search') {
      const opts = ['on', 'off', 'toggle'];
      const filt = opts.filter((o) => o.startsWith(arg.toLowerCase()));
      for (const o of filt) push(`/search ${o}`, `/search ${o}`);
      if (list.length === 0) for (const o of opts) push(`/search ${o}`, `/search ${o}`);
      return list;
    }

    if (cmd === 'reasoning') {
      const opts = ['none', 'low', 'medium', 'high'];
      const filt = opts.filter((o) => o.startsWith(arg.toLowerCase()));
      for (const o of filt) push(`/reasoning ${o}`, `/reasoning ${o}`);
      if (list.length === 0) for (const o of opts) push(`/reasoning ${o}`, `/reasoning ${o}`);
      return list;
    }

    if (cmd === 'model') {
      const q = arg.toLowerCase();
      const choices = models
        .filter(
          (m) => !q || m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q),
        )
        .slice(0, 8);
      for (const m of choices) push(m.name || m.id, `/model ${m.id}`, m.id);
      if (list.length === 0 && arg === '') push('Type a model id…', `/model `);
      return list;
    }

    if ('help'.startsWith(cmd)) {
      push('/help', '/help', 'List supported slash commands');
      return list;
    }
    // Unknown -> suggest base commands again
    for (const c of allCmds) push(`/${c.label}`, `/${c.key} `, c.help);
    return list;
  }, [text, models]);

  useEffect(() => {
    setSlashIndex(0);
  }, [text]);

  const onFilesChosen = async (files: FileList | File[]) => {
    if (!canVision) return;
    const arr = Array.from(files || []);
    const max = 4;
    const remain = Math.max(0, max - attachments.length);
    const toProcess = arr.slice(0, remain);
    const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const next: Attachment[] = [];
    for (const f of toProcess) {
      if (!accepted.includes(f.type)) continue;
      if (f.size > 5 * 1024 * 1024) continue; // 5MB cap per image
      const dataURL: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(f);
      });
      let width: number | undefined;
      let height: number | undefined;
      try {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            width = img.width;
            height = img.height;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = dataURL;
        });
      } catch {}
      next.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'image',
        name: f.name,
        mime: f.type,
        size: f.size,
        width,
        height,
        dataURL,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  const onPdfChosen = async (files: FileList | File[]) => {
    const arr = Array.from(files || []);
    const accepted = ['application/pdf'];
    const maxDocs = 2;
    const existingDocs = attachments.filter((a) => a.kind === 'pdf').length;
    const remain = Math.max(0, maxDocs - existingDocs);
    const toProcess = arr.slice(0, remain);
    for (const f of toProcess) {
      if (!accepted.includes(f.type)) continue;
      if (f.size > 15 * 1024 * 1024) continue; // 15MB per pdf
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [
        ...prev,
        { id, kind: 'pdf', name: f.name, mime: f.type, size: f.size, file: f },
      ]);
    }
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
          f.type === 'audio/wav' ||
          f.type === 'audio/mpeg' ||
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
    const accepted = ['audio/wav', 'audio/mpeg'];
    const maxAud = 1; // keep it simple: one audio per message
    const existingAud = attachments.filter((a) => a.kind === 'audio').length;
    const remain = Math.max(0, maxAud - existingAud);
    const toProcess = arr.slice(0, remain);
    const next: Attachment[] = [];
    for (const f of toProcess) {
      const isAccepted =
        accepted.includes(f.type) ||
        f.name.toLowerCase().endsWith('.wav') ||
        f.name.toLowerCase().endsWith('.mp3');
      if (!isAccepted) continue;
      if (f.size > 15 * 1024 * 1024) continue; // 15MB cap for audio
      const dataURL: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(f);
      });
      next.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'audio',
        name: f.name,
        mime: f.type || (f.name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
        size: f.size,
        dataURL,
        file: f,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  // Close the mobile actions popover on outside click, but ignore clicks on the trigger button
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const menu = document.getElementById('composer-mobile-menu');
      const trigger = mobileMenuButtonRef.current;
      const target = e.target as Node | null;
      const inMenu = !!(menu && target && menu.contains(target));
      const inTrigger = !!(trigger && target && trigger.contains(target));
      if (!inMenu && !inTrigger) setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [mobileMenuOpen]);

  const wrapperClass = variant === 'hero' ? 'composer-hero' : 'composer-chrome';
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (variant === 'hero') {
      document.documentElement.style.setProperty('--composer-height', '0px');
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const el = wrapperRef.current;
    if (!el) return;

    const applyHeight = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty('--composer-height', `${Math.round(h)}px`);
    };
    applyHeight();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--composer-height', '0px');
    };
  }, [variant]);

  return (
    <div
      ref={wrapperRef}
      className={wrapperClass}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative">
              {a.kind === 'image' && a.dataURL ? (
                <img
                  src={a.dataURL}
                  alt={a.name || 'attachment'}
                  className="h-16 w-16 object-cover rounded border border-border"
                />
              ) : a.kind === 'audio' && a.dataURL ? (
                <div className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2">
                  <audio controls src={a.dataURL} className="h-10" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate" title={a.name || 'Audio'}>
                      {a.name || 'Audio'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Attached (mp3/wav)</div>
                  </div>
                </div>
              ) : (
                <div className="h-16 min-w-40 max-w-64 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2">
                  <DocumentTextIcon className="h-5 w-5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate" title={a.name || 'PDF'}>
                      {a.name || 'PDF'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Attached (parsed by OpenRouter)
                    </div>
                  </div>
                  {/* No local OCR; handled downstream */}
                </div>
              )}
              <button
                className="absolute -top-2 -right-2 bg-surface rounded-full border border-border p-1 shadow"
                aria-label="Remove attachment"
                title="Remove"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <textarea
          ref={taRef}
          className="textarea flex-1 min-w-0 text-base"
          rows={1}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ maxHeight: `${maxTextareaHeight}px` }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={onPaste}
          aria-controls={focused && slashSuggestions.length > 0 ? 'slash-suggestions' : undefined}
          aria-activedescendant={
            focused && slashSuggestions.length > 0 ? `slash-opt-${slashIndex}` : undefined
          }
          aria-expanded={focused && slashSuggestions.length > 0 ? true : undefined}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (isStreaming) return; // allow typing while streaming, but do not send
            const hasSuggestions = focused && slashSuggestions.length > 0;
            if (hasSuggestions) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashIndex((i) => (i + 1) % slashSuggestions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashIndex((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
                return;
              }
              if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                const pick = slashSuggestions[slashIndex] || slashSuggestions[0];
                if (pick) setText(pick.insert + (pick.insert.endsWith(' ') ? '' : ' '));
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setSlashIndex(0);
                return;
              }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {/* Slash suggestions popover */}
        {focused && slashSuggestions.length > 0 && (
          <div
            id="slash-suggestions"
            role="listbox"
            className="absolute right-3 bottom-full mb-2 z-40 card p-1 popover max-w-sm"
            aria-label="Slash command suggestions"
          >
            <div className="max-h-60 overflow-auto">
              {slashSuggestions.map((sug, idx) => (
                <div
                  key={sug.title + idx}
                  id={`slash-opt-${idx}`}
                  role="option"
                  aria-selected={idx === slashIndex}
                  className={`menu-item text-sm ${idx === slashIndex ? 'font-semibold' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setText(sug.insert + (sug.insert.endsWith(' ') ? '' : ' '));
                    setSlashIndex(0);
                    taRef.current?.focus();
                  }}
                  onMouseEnter={() => setSlashIndex(idx)}
                  title={sug.subtitle || undefined}
                >
                  {sug.title}
                  {sug.subtitle ? (
                    <span className="ml-2 text-xs text-muted-foreground">{sug.subtitle}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
        {isStreaming ? (
          <button
            className="btn btn-outline self-center"
            onClick={() => {
              stop();
              // Do not refocus on small screens to avoid re-opening the keyboard
              const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
              if (!isSmall) setTimeout(() => taRef.current?.focus({ preventScroll: true } as any), 0);
            }}
            aria-label="Stop"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Hidden file input used by both desktop and mobile menu */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/wav,audio/mpeg"
              multiple
              className="hidden"
              onChange={async (e) => {
                const inputEl = e.currentTarget;
                const files = inputEl?.files;
                if (files) {
                  const arr = Array.from(files);
                  const pdfs = arr.filter((f) => f.type === 'application/pdf');
                  const imgs = arr.filter((f) => f.type.startsWith('image/'));
                  const auds = arr.filter(
                    (f) =>
                      f.type === 'audio/wav' ||
                      f.type === 'audio/mpeg' ||
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

            {/* Desktop: show full control row */}
            <div className="hidden sm:flex items-center gap-2">
              <label
                className={`btn btn-outline self-center cursor-pointer`}
                title={
                  canVision && canAudio
                    ? 'Attach images, audio (mp3/wav), or PDFs'
                    : canVision
                      ? 'Attach images or PDFs'
                      : canAudio
                        ? 'Attach audio (mp3/wav) or PDFs'
                        : 'Attach PDFs'
                }
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperClipIcon className="h-4 w-4" />
              </label>
              <button
                className={`btn self-center ${searchEnabled ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => {
                  if (chat) updateSettings({ search_with_brave: !chat.settings.search_with_brave });
                  else setUI({ nextSearchWithBrave: !uiNext.nextSearchWithBrave });
                }}
                title={`Use web search (${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'}) to augment the next message`}
                aria-label={`Toggle ${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} Search`}
                aria-pressed={!!searchEnabled}
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
              </button>
              {tutorGloballyEnabled && (
                <button
                  className={`btn self-center ${tutorEnabled ? 'btn-primary' : 'btn-outline'}`}
                  onClick={async () => {
                    if (chat) {
                      await updateSettings({ tutor_mode: !chat.settings.tutor_mode });
                    } else {
                      setUI({ nextTutorMode: true });
                      await newChat();
                    }
                  }}
                  title="Tutor mode: warm guidance + practice tools (used only when helpful)"
                  aria-label="Toggle Tutor Mode"
                  aria-pressed={tutorEnabled}
                >
                  <AcademicCapIcon className="h-4 w-4" />
                </button>
              )}
              <ReasoningEffortMenu />
            </div>

            {/* Mobile: single '+' menu to reveal actions */}
            <div className="flex sm:hidden items-center gap-2 relative">
              <button
                className="btn btn-outline self-center"
                aria-haspopup="menu"
                aria-expanded={mobileMenuOpen}
                aria-label="More actions"
                ref={mobileMenuButtonRef}
                onClick={() => setMobileMenuOpen((v) => !v)}
              >
                <EllipsisVerticalIcon className="h-4 w-4" />
              </button>
              {mobileMenuOpen && (
                <div
                  id="composer-mobile-menu"
                  role="menu"
                  className="absolute bottom-full mb-2 right-0 z-40 card p-1 popover min-w-[220px] max-w-[80vw]"
                >
                  <div className="menu-item text-sm" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                    Attach files
                  </div>
                  <div
                    className="menu-item text-sm"
                    role="menuitemcheckbox"
                    aria-checked={!!searchEnabled}
                    onClick={() => {
                      if (chat) updateSettings({ search_with_brave: !chat.settings.search_with_brave });
                      else setUI({ nextSearchWithBrave: !uiNext.nextSearchWithBrave });
                      setMobileMenuOpen(false);
                    }}
                  >
                    {`${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} Search: ${searchEnabled ? 'On' : 'Off'}`}
                  </div>
                  {tutorGloballyEnabled && (
                    <div
                      className="menu-item text-sm"
                      role="menuitemcheckbox"
                      aria-checked={!!tutorEnabled}
                      onClick={async () => {
                        if (chat) await updateSettings({ tutor_mode: !chat.settings.tutor_mode });
                        else {
                          setUI({ nextTutorMode: true });
                          await newChat();
                        }
                        setMobileMenuOpen(false);
                      }}
                    >
                      {`Tutor: ${tutorEnabled ? 'On' : 'Off'}`}
                    </div>
                  )}
                  {supportsReasoning && (
                    <>
                      <div className="text-xs text-muted-foreground px-2 pt-1">Reasoning</div>
                      {(['none', 'low', 'medium', 'high'] as Effort[]).map((eff) => (
                        <div
                          key={eff}
                          className={`menu-item text-sm ${currentEffort === eff ? 'font-semibold' : ''}`}
                          role="menuitemradio"
                          aria-checked={currentEffort === eff}
                          onClick={async () => {
                            if (chat) await updateSettings({ reasoning_effort: eff });
                            else setUI({ nextReasoningEffort: eff });
                            setMobileMenuOpen(false);
                          }}
                        >
                          {eff[0].toUpperCase() + eff.slice(1)}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              className="btn self-center"
              onClick={onSend}
              aria-label="Send"
              title="Send"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </div>
        )}
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
            {findModelById(models, modelId)?.name || modelId}
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
        {tutorGloballyEnabled && chat && (
          <button
            className={`badge flex items-center gap-1`}
            title="Toggle tutor mode"
            onClick={async () => {
              await updateSettings({ tutor_mode: !chat.settings.tutor_mode });
            }}
            aria-pressed={!!chat?.settings.tutor_mode}
          >
            <AcademicCapIcon className="h-3.5 w-3.5" />{' '}
            {chat?.settings.tutor_mode ? 'Tutor On' : 'Tutor Off'}
          </button>
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
        {
          <button
            className="badge flex items-center gap-1"
            title={`Toggle ${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} web search for next message`}
            onClick={() => {
              if (chat) updateSettings({ search_with_brave: !chat.settings.search_with_brave });
              else setUI({ nextSearchWithBrave: !uiNext.nextSearchWithBrave });
            }}
            aria-pressed={!!searchEnabled}
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5" /> {(searchProvider === 'openrouter' ? 'OR' : 'Brave') + ' ' + (searchEnabled ? 'On' : 'Off')}
          </button>
        }
        {(() => {
          const effort = chat?.settings.reasoning_effort ?? uiNext.nextReasoningEffort;
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
        {tokenAndCost.promptTokens > 0 && (
          <span className="badge" title="Approximate tokens and prompt cost">
            ≈ {tokenAndCost.promptTokens} tok
            {tokenAndCost.total != null
              ? ` · ${tokenAndCost.currency} ${tokenAndCost.total.toFixed(5)}`
              : ''}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Press Enter to send · Shift+Enter for newline
        </span>
      </div>
    </div>
  );
}
