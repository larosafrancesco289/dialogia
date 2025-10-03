import { findModelById, isAudioInputSupported, isVisionSupported } from '@/lib/models';
import type { ORModel, Attachment } from '@/lib/types';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function extractBase64(dataUrl: string | undefined): string | undefined {
  if (!dataUrl) return undefined;
  const idx = dataUrl.indexOf('base64,');
  return idx >= 0 ? dataUrl.slice(idx + 'base64,'.length) : undefined;
}

function detectAudioFormat(attachment: Attachment): 'wav' | 'mp3' | undefined {
  if (attachment.audioFormat) return attachment.audioFormat;
  if (attachment.mime?.includes('wav')) return 'wav';
  if (attachment.mime?.includes('mpeg') || attachment.mime?.includes('mp3')) return 'mp3';
  const name = (attachment.name || '').toLowerCase();
  if (name.endsWith('.wav')) return 'wav';
  if (name.endsWith('.mp3')) return 'mp3';
  return undefined;
}

export async function prepareAttachmentsForModel(opts: {
  attachments?: Attachment[];
  modelId: string;
  models: ORModel[];
}): Promise<Attachment[]> {
  const { attachments = [], modelId, models } = opts;
  if (attachments.length === 0) return [];

  const modelMeta = findModelById(models, modelId);
  const allowVision = isVisionSupported(modelMeta);
  const allowAudio = isAudioInputSupported(modelMeta);

  const filtered = attachments.filter((attachment) => {
    if (attachment.kind === 'image') return allowVision;
    if (attachment.kind === 'audio') return allowAudio;
    return true;
  });

  const processed = await Promise.all(
    filtered.map(async (attachment) => {
      if (attachment.kind === 'pdf' && attachment.file && !attachment.dataURL) {
        try {
          const dataURL = await fileToDataUrl(attachment.file);
          return { ...attachment, dataURL };
        } catch {
          return attachment;
        }
      }
      if (attachment.kind === 'audio') {
        let dataURL = attachment.dataURL;
        if (!dataURL && attachment.file) {
          try {
            dataURL = await fileToDataUrl(attachment.file);
          } catch {
            dataURL = undefined;
          }
        }
        const base64 = attachment.base64 || extractBase64(dataURL);
        const audioFormat = detectAudioFormat(attachment);
        return { ...attachment, dataURL, base64, audioFormat };
      }
      return attachment;
    }),
  );

  return processed;
}
