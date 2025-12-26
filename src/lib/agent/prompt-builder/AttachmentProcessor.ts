import type { PersistedAttachment } from '@/lib/types';
import type { ModelContentBlock } from '@/lib/agent/types';
import { detectAudioFormatFromAttachment, extractBase64FromDataUrl } from '@/lib/attachments/audio';

export class AttachmentProcessor {
  static process(attachments: PersistedAttachment[]): ModelContentBlock[] {
    const blocks: ModelContentBlock[] = [];
    for (const a of attachments) {
      if (a.kind === 'image' && a.dataURL) {
        blocks.push({ type: 'image_url', image_url: { url: a.dataURL } });
      } else if (a.kind === 'pdf' && a.dataURL) {
        blocks.push({
          type: 'file',
          file: {
            filename: a.name || 'document.pdf',
            file_data: a.dataURL,
          },
        });
      } else if (a.kind === 'audio') {
        const format = detectAudioFormatFromAttachment(a);
        const base64 = a.base64 || extractBase64FromDataUrl(a.dataURL);
        if (base64 && format) {
          blocks.push({
            type: 'input_audio',
            input_audio: {
              data: base64,
              format,
            },
          });
        }
      }
    }
    return blocks;
  }
}
