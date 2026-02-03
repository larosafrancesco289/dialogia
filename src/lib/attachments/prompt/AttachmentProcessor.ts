import type { PersistedAttachment } from '@/lib/types';
import type { ModelContentBlock } from '@/lib/agent/types';
import { detectAudioFormatFromAttachment, extractBase64FromDataUrl } from '@/lib/attachments/audio';

// Maximum base64 payload size (in bytes) before we prefer extracted text.
// OpenRouter/Cloudflare has ~10MB limit; base64 adds ~33% overhead.
// We use 5MB as a safe threshold to avoid hitting limits.
const MAX_PDF_PAYLOAD_BYTES = 5 * 1024 * 1024;

export class AttachmentProcessor {
  static process(attachments: PersistedAttachment[]): ModelContentBlock[] {
    const blocks: ModelContentBlock[] = [];
    for (const a of attachments) {
      if (a.kind === 'image' && a.dataURL) {
        blocks.push({ type: 'image_url', image_url: { url: a.dataURL } });
      } else if (a.kind === 'pdf') {
        // Prefer extracted text to avoid payload size limits.
        // Fall back to file_data only for small PDFs without extracted text.
        if (a.text && a.text.trim()) {
          const header = a.name ? `[Document: ${a.name}]` : '[Document]';
          const pageInfo = a.pageCount ? ` (${a.pageCount} pages)` : '';
          blocks.push({
            type: 'text',
            text: `${header}${pageInfo}\n\n${a.text}`,
          });
        } else if (a.dataURL) {
          // Only send raw file data if it's small enough
          const payloadSize = a.dataURL.length;
          if (payloadSize <= MAX_PDF_PAYLOAD_BYTES) {
            blocks.push({
              type: 'file',
              file: {
                filename: a.name || 'document.pdf',
                file_data: a.dataURL,
              },
            });
          } else {
            // PDF too large and no extracted text available
            blocks.push({
              type: 'text',
              text: `[Document: ${a.name || 'document.pdf'}] (Unable to process: file too large for direct upload. Please try a smaller file or a text-based format.)`,
            });
          }
        }
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
