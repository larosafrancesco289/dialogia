import { useCallback, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import type { DraftAttachment } from '@/lib/types';
import {
  toImageAttachment,
  toPdfAttachment,
  toAudioAttachment,
  clampImages,
} from '@/lib/attachments/ui';

type UseComposerAttachmentsOptions = {
  canVision: boolean;
  canAudio: boolean;
};

export function useComposerAttachments({ canVision, canAudio }: UseComposerAttachmentsOptions) {
  const [attachmentsState, setAttachmentsState] = useState<DraftAttachment[]>([]);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setAttachments = useCallback((next: DraftAttachment[]) => {
    attachmentsRef.current = next;
    setAttachmentsState(next);
  }, []);

  const appendAttachments = useCallback(
    (next: DraftAttachment[]) => {
      if (!next.length) return;
      setAttachments([...attachmentsRef.current, ...next]);
    },
    [setAttachments],
  );

  const processImages = useCallback(
    async (files: File[]) => {
      if (!canVision || files.length === 0) return;
      const existingImages = attachmentsRef.current.filter((att) => att.kind === 'image').length;
      const limited = clampImages(existingImages, files);
      const converted: DraftAttachment[] = [];
      for (const file of limited) {
        const att = await toImageAttachment(file);
        if (att) converted.push(att);
      }
      appendAttachments(converted);
    },
    [appendAttachments, canVision],
  );

  const processPdfs = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const maxDocs = 2;
      const existingDocs = attachmentsRef.current.filter((att) => att.kind === 'pdf').length;
      const remaining = Math.max(0, maxDocs - existingDocs);
      const toConvert = files.slice(0, remaining);
      const converted: DraftAttachment[] = [];
      for (const file of toConvert) {
        const att = await toPdfAttachment(file);
        if (att) converted.push(att);
      }
      appendAttachments(converted);
    },
    [appendAttachments],
  );

  const processAudio = useCallback(
    async (files: File[]) => {
      if (!canAudio || files.length === 0) return;
      const maxAudio = 1;
      const existing = attachmentsRef.current.filter((att) => att.kind === 'audio').length;
      const remaining = Math.max(0, maxAudio - existing);
      const toConvert = files.slice(0, remaining);
      const converted: DraftAttachment[] = [];
      for (const file of toConvert) {
        const att = await toAudioAttachment(file);
        if (att) converted.push(att);
      }
      appendAttachments(converted);
    },
    [appendAttachments, canAudio],
  );

  const handleFileInputChange = useCallback(
    async (input: HTMLInputElement | null) => {
      if (!input?.files) return;
      const files = Array.from(input.files);
      const pdfs = files.filter((file) => file.type === 'application/pdf');
      const images = files.filter((file) => file.type.startsWith('image/'));
      const audios = files.filter(
        (file) =>
          file.type.startsWith('audio/') ||
          file.name.toLowerCase().endsWith('.wav') ||
          file.name.toLowerCase().endsWith('.mp3'),
      );
      if (pdfs.length) await processPdfs(pdfs);
      if (images.length) await processImages(images);
      if (audios.length) await processAudio(audios);
      input.value = '';
    },
    [processAudio, processImages, processPdfs],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      const pdfs = files.filter((file) => file.type === 'application/pdf');
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length) await processImages(images);
      if (pdfs.length) await processPdfs(pdfs);
    },
    [processImages, processPdfs],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const fileArray = Array.from(files);
      const pdfs = fileArray.filter((file) => file.type === 'application/pdf');
      const images = fileArray.filter((file) => file.type.startsWith('image/'));
      const audios = fileArray.filter(
        (file) =>
          file.type.startsWith('audio/') ||
          file.name.toLowerCase().endsWith('.wav') ||
          file.name.toLowerCase().endsWith('.mp3'),
      );
      if (images.length) await processImages(images);
      if (pdfs.length) await processPdfs(pdfs);
      if (audios.length) await processAudio(audios);
    },
    [processAudio, processImages, processPdfs],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      setAttachments(attachmentsRef.current.filter((attachment) => attachment.id !== id));
    },
    [setAttachments],
  );

  const resetAttachments = useCallback(() => {
    setAttachments([]);
  }, [setAttachments]);

  const replaceAttachments = useCallback(
    (next: DraftAttachment[]) => {
      setAttachments(next);
    },
    [setAttachments],
  );

  const attachmentsHint = useMemo(() => {
    if (canVision && canAudio) return 'Attach images, audio (mp3/wav), or PDFs';
    if (canVision) return 'Attach images or PDFs';
    if (canAudio) return 'Attach audio (mp3/wav) or PDFs';
    return 'Attach PDFs';
  }, [canAudio, canVision]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    attachments: attachmentsState,
    attachmentsHint,
    fileInputRef,
    handleFileInputChange,
    handlePaste,
    handleDrop,
    openFilePicker,
    removeAttachment,
    resetAttachments,
    replaceAttachments,
  };
}
