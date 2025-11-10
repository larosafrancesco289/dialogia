import { prepareAttachmentsForModel } from '@/lib/agent/attachments';
import type { Attachment, ORModel } from '@/lib/types';

export const prepareAttachmentsByModel = async ({
  attachments,
  modelIds,
  models,
}: {
  attachments?: Attachment[];
  modelIds: string[];
  models: ORModel[];
}): Promise<Map<string, Attachment[]>> => {
  const map = new Map<string, Attachment[]>();
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
