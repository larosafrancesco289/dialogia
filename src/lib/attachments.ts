// Module: attachments (UI-side)
// Responsibility: Utilities for reading files and mapping them to UI attachments with guards.

import type { DraftAttachment } from '@/lib/types';
import { MAX_AUDIO_SIZE_MB, MAX_IMAGES_PER_MESSAGE, MAX_PDF_SIZE_MB } from '@/lib/constants';
import { fileToDataUrl } from '@/lib/attachments/readers';
import { detectAudioFormatFromFile } from '@/lib/attachments/audio';

export async function toImageAttachment(file: File): Promise<DraftAttachment | null> {
  const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!accepted.includes(file.type)) return null;
  if (file.size > 5 * 1024 * 1024) return null; // enforce 5MB cap per image
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

export async function toPdfAttachment(file: File): Promise<DraftAttachment | null> {
  if (file.type !== 'application/pdf') return null;
  if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) return null;
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'pdf',
    name: file.name,
    mime: file.type,
    size: file.size,
    file,
  };
}

export async function toAudioAttachment(file: File): Promise<DraftAttachment | null> {
  const fmt = detectAudioFormatFromFile(file);
  if (!fmt) return null;
  if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) return null;
  const dataURL = await fileToDataUrl(file);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'audio',
    name: file.name,
    mime: file.type || (fmt === 'wav' ? 'audio/wav' : 'audio/mpeg'),
    size: file.size,
    dataURL,
    file,
  } as any;
}

export function clampImages(currentCount: number, files: FileList | File[]): File[] {
  const remain = Math.max(0, MAX_IMAGES_PER_MESSAGE - currentCount);
  return Array.from(files || []).slice(0, remain);
}
