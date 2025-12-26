import { findModelById, isAudioInputSupported, isVisionSupported } from '@/lib/models';
import type { DraftAttachment, ORModel, PersistedAttachment } from '@/lib/types';
import { fileToDataUrl } from '@/lib/attachments/readers';
import {
  detectAudioFormatFromAttachment,
  extractBase64FromDataUrl,
} from '@/lib/attachments/audio';

function stripFile(attachment: DraftAttachment): PersistedAttachment {
  const { file: _file, ...rest } = attachment;
  return rest;
}

export async function prepareAttachmentsForModel(opts: {
  attachments?: DraftAttachment[];
  modelId: string;
  models: ORModel[];
}): Promise<PersistedAttachment[]> {
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
          return { ...stripFile(attachment), dataURL };
        } catch {
          return stripFile(attachment);
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
        const base64 = attachment.base64 || extractBase64FromDataUrl(dataURL);
        const audioFormat = detectAudioFormatFromAttachment(attachment);
        return { ...stripFile(attachment), dataURL, base64, audioFormat };
      }
      return stripFile(attachment);
    }),
  );

  return processed;
}
