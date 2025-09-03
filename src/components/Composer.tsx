'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import {
  StopIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  PaperClipIcon,
  XMarkIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import ReasoningEffortMenu from '@/components/ReasoningEffortMenu';
import { estimateTokens } from '@/lib/tokenEstimate';
import { computeCost } from '@/lib/cost';
import { findModelById, isVisionSupported } from '@/lib/models';
import type { Attachment } from '@/lib/types';
import { extractPdfTextViaApi } from '@/lib/pdf';
import { ocrPdfFile } from '@/lib/ocr';

export default function Composer() {
  const send = useChatStore((s) => s.sendUserMessage);
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const models = useChatStore((s) => s.models);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pdfBusyIds, setPdfBusyIds] = useState<Record<string, boolean>>({});
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);
  const updateSettings = useChatStore((s) => s.updateChatSettings);
  const setUI = useChatStore((s) => s.setUI);

  const onSend = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    const toSend = attachments.slice();
    setAttachments([]);
    // Keep the caret in the box so the user can continue typing immediately
    taRef.current?.focus();
    await send(value, { attachments: toSend });
  };

  // Autofocus on mount and when chat changes or streaming stops
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, []);
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, [selectedChatId]);
  useEffect(() => {
    if (!isStreaming) taRef.current?.focus({ preventScroll: true } as any);
  }, [isStreaming]);

  useAutogrowTextarea(taRef, [text]);

  // Lightweight, live prompt token and cost estimate
  const tokenAndCost = useMemo(() => {
    const promptTokens = estimateTokens(text) || 0;
    const modelMeta = findModelById(models, chat?.settings.model);
    const cost = computeCost({ model: modelMeta, promptTokens });
    return { promptTokens, currency: cost.currency, total: cost.total };
  }, [text, chat?.settings.model, models]);

  const modelMeta = findModelById(models, chat?.settings.model);
  const canVision = isVisionSupported(modelMeta);

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
      setPdfBusyIds((s) => ({ ...s, [id]: true }));
      setAttachments((prev) => [
        ...prev,
        { id, kind: 'pdf', name: f.name, mime: f.type, size: f.size, file: f },
      ]);
      const res = await extractPdfTextViaApi(f);
      setPdfBusyIds((s) => ({ ...s, [id]: false }));
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, text: res?.text || '', pageCount: res?.pageCount } : a,
        ),
      );
    }
  };

  const runOcrFor = async (id: string) => {
    const att = attachments.find((a) => a.id === id && a.kind === 'pdf');
    if (!att || !att.file) return;
    setPdfBusyIds((s) => ({ ...s, [id]: true }));
    try {
      const text = await ocrPdfFile(att.file, {
        pages: 3,
        targetWidth: 1200,
        lang: 'eng',
        onProgress: () => void 0,
      });
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
    } finally {
      setPdfBusyIds((s) => ({ ...s, [id]: false }));
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
      if (imgs.length && canVision) await onFilesChosen(imgs);
      if (pdfs.length) await onPdfChosen(pdfs);
    }
  };

  return (
    <div className="composer-chrome" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
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
              ) : (
                <div className="h-16 min-w-40 max-w-64 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2">
                  <DocumentTextIcon className="h-5 w-5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate" title={a.name || 'PDF'}>
                      {a.name || 'PDF'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {pdfBusyIds[a.id]
                        ? 'Extracting…'
                        : a.text && a.text.length > 0
                          ? a.pageCount
                            ? `${a.pageCount} pages`
                            : 'Text extracted'
                          : 'No text found'}
                    </div>
                  </div>
                  {!pdfBusyIds[a.id] && (!a.text || a.text.length === 0) && (
                    <button
                      className="btn btn-outline btn-xs ml-auto"
                      title="Run OCR on first pages"
                      onClick={() => runOcrFor(a.id)}
                    >
                      OCR
                    </button>
                  )}
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
      <div className="flex items-center gap-3">
        <textarea
          ref={taRef}
          className="textarea flex-1 text-base"
          rows={1}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (isStreaming) return; // allow typing while streaming, but do not send
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {isStreaming ? (
          <button
            className="btn btn-outline self-center"
            onClick={() => {
              stop();
              setTimeout(() => taRef.current?.focus({ preventScroll: true } as any), 0);
            }}
            aria-label="Stop"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <label
              className={`btn self-center cursor-pointer ${canVision ? '' : 'opacity-50 pointer-events-none'}`}
              title={canVision ? 'Attach images' : 'This model does not support images'}
              aria-disabled={!canVision}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const inputEl = e.currentTarget;
                  const files = inputEl?.files;
                  if (files) await onFilesChosen(files);
                  // reset input value to allow re-choosing same files
                  if (inputEl) inputEl.value = '';
                }}
                disabled={!canVision}
              />
              <PhotoIcon className="h-4 w-4" />
            </label>
            <label className="btn self-center cursor-pointer" title="Attach PDF(s)">
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const inputEl = e.currentTarget;
                  const files = inputEl?.files;
                  if (files) await onPdfChosen(files);
                  if (inputEl) inputEl.value = '';
                }}
              />
              <PaperClipIcon className="h-4 w-4" />
            </label>
            <button
              className={`btn self-center ${chat?.settings.search_with_brave ? 'btn-primary' : 'btn-outline'}`}
              onClick={() =>
                updateSettings({ search_with_brave: !chat?.settings.search_with_brave })
              }
              title="Use web search (Brave) to augment the next message"
              aria-label="Toggle Brave Search"
              aria-pressed={!!chat?.settings.search_with_brave}
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </button>
            {/* Show reasoning effort picker only for reasoning-capable models */}
            <ReasoningEffortMenu />
            <button
              className="btn btn-outline self-center"
              onClick={onSend}
              aria-label="Send"
              title="Send"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {/* Helper chips row: current model, reasoning, web search, token estimate */}
      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
        {chat && (
          <button
            className="badge"
            title="Change model (opens Settings)"
            onClick={() => setUI({ showSettings: true })}
          >
            {findModelById(models, chat.settings.model)?.name || chat.settings.model}
          </button>
        )}
        {canVision && (
          <span
            className="badge"
            title="This model supports image input. Click the photo icon or paste/drag images here."
          >
            Vision supported
          </span>
        )}
        {chat && (
          <button
            className="badge"
            title="Toggle Brave web search for next message"
            onClick={() => updateSettings({ search_with_brave: !chat?.settings.search_with_brave })}
            aria-pressed={!!chat?.settings.search_with_brave}
          >
            {chat?.settings.search_with_brave ? 'Web search: On' : 'Web search: Off'}
          </button>
        )}
        {chat?.settings.reasoning_effort && (
          <span className="badge" title="Reasoning effort for this chat">
            Reasoning: {chat.settings.reasoning_effort}
          </span>
        )}
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
