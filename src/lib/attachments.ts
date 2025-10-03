// Module: attachments (UI-side)
// Responsibility: Utilities for reading files and mapping them to UI attachments with guards.

import type { Attachment } from '@/lib/types';
import { MAX_AUDIO_SIZE_MB, MAX_IMAGES_PER_MESSAGE, MAX_PDF_SIZE_MB } from '@/lib/constants';

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function detectAudioFormat(file: File): 'wav' | 'mp3' | undefined {
  const name = file.name.toLowerCase();
  if (file.type.includes('wav') || name.endsWith('.wav')) return 'wav';
  if (file.type.includes('mpeg') || file.type.includes('mp3') || name.endsWith('.mp3'))
    return 'mp3';
  return undefined;
}

export async function toImageAttachment(file: File): Promise<Attachment | null> {
  const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!accepted.includes(file.type)) return null;
  if (file.size > 5 * 1024 * 1024) return null; // enforce 5MB cap per image
  const dataURL = await readFileAsDataURL(file);
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

export async function toPdfAttachment(file: File): Promise<Attachment | null> {
  if (file.type !== 'application/pdf') return null;
  if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) return null;
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'pdf',
    name: file.name,
    mime: file.type,
    size: file.size,
    file,
  } as any;
}

export async function toAudioAttachment(file: File): Promise<Attachment | null> {
  const fmt = detectAudioFormat(file);
  if (!fmt) return null;
  if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) return null;
  const dataURL = await readFileAsDataURL(file);
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
