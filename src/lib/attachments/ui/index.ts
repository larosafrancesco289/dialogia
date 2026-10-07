// Module: attachments/ui
// Responsibility: UI-side utilities for reading files and mapping them to DraftAttachment.

import type { DraftAttachment } from '@/lib/types';
import {
  MAX_AUDIO_PER_MESSAGE,
  MAX_AUDIO_SIZE_MB,
  MAX_IMAGE_SIZE_MB,
  MAX_IMAGES_PER_MESSAGE,
  MAX_PDF_SIZE_MB,
  MAX_PDFS_PER_MESSAGE,
} from '@/lib/constants';
import { fileToDataUrl } from '@/lib/attachments/readers';
import { detectAudioFormatFromFile } from '@/lib/attachments/audio';
import { extractTextFromPdf } from '@/lib/attachments/pdf';
import { t } from '@/lib/i18n';
import { formatList } from '@/lib/i18n/format';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MB = 1024 * 1024;

const isPdf = (file: File) => file.type === 'application/pdf';
const isImage = (file: File) => file.type.startsWith('image/');
const isAudio = (file: File) =>
  file.type.startsWith('audio/') ||
  file.name.toLowerCase().endsWith('.wav') ||
  file.name.toLowerCase().endsWith('.mp3');

/** The kinds of file a model takes, for the attach hint and the left-out notice. */
export function acceptedKinds(canVision: boolean, canAudio: boolean): string {
  if (canVision && canAudio) return t('attach.kinds.all');
  if (canVision) return t('attach.kinds.images');
  if (canAudio) return t('attach.kinds.audio');
  return t('attach.kinds.pdf');
}

export type AttachmentPick = {
  pdfs: File[];
  images: File[];
  audio: File[];
  /** One notice naming every file left out, and why; undefined when all were taken. */
  notice?: string;
};

/**
 * Sorts a pick, drop or paste into the files to attach and the files left
 * out: a kind the model does not take, a file over its size cap, or one past
 * the count a message allows (counting what the draft already holds).
 */
export function sortAttachmentPick(
  files: File[],
  opts: {
    canVision: boolean;
    canAudio: boolean;
    existing: { pdf: number; image: number; audio: number };
  },
): AttachmentPick {
  const pick: AttachmentPick = { pdfs: [], images: [], audio: [] };
  const skipped = new Map<string, string[]>();
  const skip = (file: File, reason: string) =>
    skipped.set(reason, [...(skipped.get(reason) ?? []), file.name || t('attach.aFile')]);
  const take = (
    file: File,
    into: File[],
    limit: { count: number; perMessage: string; maxMb: number },
  ) => {
    if (file.size > limit.maxMb * MB) skip(file, t('attach.tooLarge', { max: limit.maxMb }));
    else if (into.length >= limit.count) {
      skip(file, t('attach.perMessage', { limit: limit.perMessage }));
    } else into.push(file);
  };
  const room = (max: number, used: number) => Math.max(0, max - used);

  for (const file of files) {
    if (isPdf(file)) {
      take(file, pick.pdfs, {
        count: room(MAX_PDFS_PER_MESSAGE, opts.existing.pdf),
        perMessage: t('attach.pdfs', { count: MAX_PDFS_PER_MESSAGE }),
        maxMb: MAX_PDF_SIZE_MB,
      });
    } else if (opts.canVision && isImage(file)) {
      if (!IMAGE_TYPES.includes(file.type)) skip(file, t('attach.imageTypes'));
      else
        take(file, pick.images, {
          count: room(MAX_IMAGES_PER_MESSAGE, opts.existing.image),
          perMessage: t('attach.images', { count: MAX_IMAGES_PER_MESSAGE }),
          maxMb: MAX_IMAGE_SIZE_MB,
        });
    } else if (opts.canAudio && !isImage(file) && isAudio(file)) {
      if (!detectAudioFormatFromFile(file)) skip(file, t('attach.audioTypes'));
      else
        take(file, pick.audio, {
          count: room(MAX_AUDIO_PER_MESSAGE, opts.existing.audio),
          perMessage: t('attach.audioFiles', { count: MAX_AUDIO_PER_MESSAGE }),
          maxMb: MAX_AUDIO_SIZE_MB,
        });
    } else {
      skip(file, t('attach.modelTakes', { kinds: acceptedKinds(opts.canVision, opts.canAudio) }));
    }
  }

  if (skipped.size > 0) {
    const parts = [...skipped].map(([reason, names]) => `${formatList(names)} (${reason})`);
    pick.notice = t('attach.notAttached', { files: parts.join('; ') });
  }
  return pick;
}

export async function toImageAttachment(file: File): Promise<DraftAttachment> {
  const dataURL = await fileToDataUrl(file);
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
  } catch {
    width = undefined;
    height = undefined;
  }
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'image',
    name: file.name,
    mime: file.type,
    size: file.size,
    width,
    height,
    dataURL,
  };
}

export async function toPdfAttachment(file: File): Promise<DraftAttachment> {
  // Extract text from PDF client-side to avoid payload size limits.
  let text: string | undefined;
  let pageCount: number | undefined;
  try {
    const result = await extractTextFromPdf(file);
    text = result.text;
    pageCount = result.pageCount;
  } catch {
    // If extraction fails, we'll still create the attachment without text.
    // The file will be sent as base64 if small enough, otherwise it will fail.
  }

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'pdf',
    name: file.name,
    mime: file.type,
    size: file.size,
    file,
    text,
    pageCount,
  };
}

/** For a file sortAttachmentPick took, which it does only as mp3 or wav. */
export async function toAudioAttachment(file: File): Promise<DraftAttachment> {
  const fmt = detectAudioFormatFromFile(file) ?? 'mp3';
  const dataURL = await fileToDataUrl(file);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'audio',
    name: file.name,
    mime: file.type || (fmt === 'wav' ? 'audio/wav' : 'audio/mpeg'),
    size: file.size,
    dataURL,
    file,
    audioFormat: fmt,
  };
}
