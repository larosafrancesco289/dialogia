// Module: attachments/prepare
// Responsibility: Convert DraftAttachment -> PersistedAttachment with per-model filtering.

import { findModelById, isAudioInputSupported, isVisionSupported } from '@/lib/models';
import type { DraftAttachment, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import { fileToDataUrl } from '@/lib/attachments/readers';
import { detectAudioFormatFromAttachment, extractBase64FromDataUrl } from '@/lib/attachments/audio';

function stripFile(attachment: DraftAttachment): PersistedAttachment {
  const { file: _file, ...rest } = attachment;
  return rest;
}

export type PreparedAttachments = {
  attachments: PersistedAttachment[];
  /** Attachment kinds this model cannot accept, so the caller can say so. */
  droppedKinds: string[];
};

export async function prepareAttachmentsForModel(opts: {
  attachments?: DraftAttachment[];
  modelId: string;
  models: ModelDescriptor[];
}): Promise<PreparedAttachments> {
  const { attachments = [], modelId, models } = opts;
  if (attachments.length === 0) return { attachments: [], droppedKinds: [] };

  const modelMeta = findModelById(models, modelId);
  const allowVision = isVisionSupported(modelMeta);
  const allowAudio = isAudioInputSupported(modelMeta);

  const dropped = new Set<string>();
  const filtered = attachments.filter((attachment) => {
    if (attachment.kind === 'image' && !allowVision) {
      dropped.add('image');
      return false;
    }
    if (attachment.kind === 'audio' && !allowAudio) {
      dropped.add('audio');
      return false;
    }
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

  return { attachments: processed, droppedKinds: Array.from(dropped) };
}

export const prepareAttachmentsByModel = async ({
  attachments,
  modelIds,
  models,
}: {
  attachments?: DraftAttachment[];
  modelIds: string[];
  models: ModelDescriptor[];
}): Promise<{ byModel: Map<string, PersistedAttachment[]>; droppedKinds: string[] }> => {
  const byModel = new Map<string, PersistedAttachment[]>();
  const dropped = new Set<string>();
  await Promise.all(
    modelIds.map(async (modelId) => {
      const prepared = await prepareAttachmentsForModel({
        attachments,
        modelId,
        models,
      });
      byModel.set(modelId, prepared.attachments);
      for (const kind of prepared.droppedKinds) dropped.add(kind);
    }),
  );
  return { byModel, droppedKinds: Array.from(dropped) };
};
