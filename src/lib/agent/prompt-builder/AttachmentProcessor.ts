import type { Attachment } from '@/lib/types';
import type { ModelContentBlock } from '@/lib/agent/types';

export class AttachmentProcessor {
  static process(attachments: Attachment[]): ModelContentBlock[] {
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
        const fmt: any =
          a.audioFormat ||
          (a.mime?.includes('wav') ? 'wav' : a.mime?.includes('mp3') ? 'mp3' : undefined);
        const fromDataUrl = (url?: string): string | undefined => {
          if (!url) return undefined;
          const idx = url.indexOf('base64,');
          if (idx >= 0) return url.slice(idx + 'base64,'.length);
          return undefined;
        };
        const base64 = a.base64 || fromDataUrl(a.dataURL);
        if (base64 && fmt) {
          blocks.push({
            type: 'input_audio',
            input_audio: {
              data: base64,
              format: fmt,
            },
          });
        }
      }
    }
    return blocks;
  }
}
