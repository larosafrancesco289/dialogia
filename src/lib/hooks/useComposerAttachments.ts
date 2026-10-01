import { useCallback, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import type { DraftAttachment } from '@/lib/types';
import {
  acceptedKinds,
  sortAttachmentPick,
  toImageAttachment,
  toPdfAttachment,
  toAudioAttachment,
} from '@/lib/attachments/ui';

type UseComposerAttachmentsOptions = {
  canVision: boolean;
  canAudio: boolean;
  /** Told which files were left out, so a drop or pick never fails silently. */
  onSkipped?: (message: string) => void;
};

export function useComposerAttachments({
  canVision,
  canAudio,
  onSkipped,
}: UseComposerAttachmentsOptions) {
  const [attachmentsState, setAttachmentsState] = useState<DraftAttachment[]>([]);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setAttachments = useCallback((next: DraftAttachment[]) => {
    attachmentsRef.current = next;
    setAttachmentsState(next);
  }, []);

  const intake = useCallback(
    async (files: File[]) => {
      const count = (kind: DraftAttachment['kind']) =>
        attachmentsRef.current.filter((att) => att.kind === kind).length;
      const pick = sortAttachmentPick(files, {
        canVision,
        canAudio,
        existing: { pdf: count('pdf'), image: count('image'), audio: count('audio') },
      });
      if (pick.notice) onSkipped?.(pick.notice);
      const converted: DraftAttachment[] = [];
      for (const file of pick.pdfs) converted.push(await toPdfAttachment(file));
      for (const file of pick.images) converted.push(await toImageAttachment(file));
      for (const file of pick.audio) converted.push(await toAudioAttachment(file));
      if (converted.length) setAttachments([...attachmentsRef.current, ...converted]);
    },
    [canAudio, canVision, onSkipped, setAttachments],
  );

  const handleFileInputChange = useCallback(
    async (input: HTMLInputElement | null) => {
      if (!input?.files) return;
      await intake(Array.from(input.files));
      input.value = '';
    },
    [intake],
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
      await intake(files);
    },
    [intake],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      await intake(Array.from(files));
    },
    [intake],
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

  const attachmentsHint = `Attach ${acceptedKinds(canVision, canAudio)}`;

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
