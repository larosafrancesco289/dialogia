// Module: attachments/prepareByModel
// Responsibility: Prepare per-model attachment payloads without store or persistence side effects.

import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import type { DraftAttachment, ModelDescriptor, PersistedAttachment } from '@/lib/types';

export const prepareAttachmentsByModel = async ({
  attachments,
  modelIds,
  models,
}: {
  attachments?: DraftAttachment[];
  modelIds: string[];
  models: ModelDescriptor[];
}): Promise<Map<string, PersistedAttachment[]>> => {
  const map = new Map<string, PersistedAttachment[]>();
  await Promise.all(
    modelIds.map(async (modelId) => {
      const prepared = await prepareAttachmentsForModel({
        attachments,
        modelId,
        models,
      });
      map.set(modelId, prepared);
    }),
  );
  return map;
};
