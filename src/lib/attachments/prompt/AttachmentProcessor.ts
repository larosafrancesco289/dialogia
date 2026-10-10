import type { PersistedAttachment } from '@/lib/types';
import type { ModelContentBlock } from '@/lib/agent/types';
import { detectAudioFormatFromAttachment, extractBase64FromDataUrl } from '@/lib/attachments/audio';
import { estimateTokens } from '@/lib/tokenEstimate';

// Maximum base64 payload size (in bytes) before we prefer extracted text.
// OpenRouter/Cloudflare has ~10MB limit; base64 adds ~33% overhead.
// We use 5MB as a safe threshold to avoid hitting limits.
const MAX_PDF_PAYLOAD_BYTES = 5 * 1024 * 1024;

// What one file costs a request, roughly, for the context budget: each
// provider counts its own, and these sit at the generous end of the major
// ones (an image is about 1,000 to 1,600 tokens; a minute or so of audio; a
// PDF sent as a file is read page by page, much as images).
const IMAGE_TOKENS = 1500;
const AUDIO_TOKENS = 2500;
const PDF_PAGE_TOKENS = 1500;
// A page's worth of a PDF whose pages were never counted (a scan runs ~100 KB a page).
const PDF_BYTES_PER_PAGE = 100_000;

/** Whether a PDF file of this many bytes is small enough to send as it is (as a data URL). */
export const pdfFileFits = (bytes: number | undefined): boolean =>
  typeof bytes !== 'number' || Math.ceil(bytes / 3) * 4 + 64 <= MAX_PDF_PAYLOAD_BYTES;

/** Whether a PDF's text was read: a scan reads as whitespace, which is no text. */
export const hasPdfText = (attachment: { text?: string }): boolean =>
  typeof attachment.text === 'string' && attachment.text.trim().length > 0;

/** How a message's attachments go to the model. */
export type AttachmentReplay = {
  /** What the model can take in; an image or a recording it cannot is a line naming it. */
  canSee: boolean;
  canAudio: boolean;
  /**
   * Whether images, recordings and PDFs sent as files go in full. Off for an
   * older message, where each is a line naming it: they would otherwise be
   * sent again, and paid for again, with every later turn. A PDF's text is
   * words like any other and always goes.
   */
  files: boolean;
};

const IN_FULL: AttachmentReplay = { canSee: true, canAudio: true, files: true };

const line = (text: string): ModelContentBlock => ({ type: 'text', text });

function blockFor(a: PersistedAttachment, replay: AttachmentReplay): ModelContentBlock | undefined {
  if (a.kind === 'image') {
    const name = a.name || 'image';
    if (!replay.canSee) return line(`[image: ${name}, which this model cannot see]`);
    if (!a.dataURL) return undefined;
    if (!replay.files) return line(`[image: ${name}, shared earlier]`);
    return { type: 'image_url', image_url: { url: a.dataURL } };
  }
  if (a.kind === 'audio') {
    const name = a.name || 'audio';
    if (!replay.canAudio) return line(`[audio: ${name}, which this model cannot hear]`);
    const format = detectAudioFormatFromAttachment(a);
    const base64 = a.base64 || extractBase64FromDataUrl(a.dataURL);
    if (!base64 || !format) return undefined;
    if (!replay.files) return line(`[audio: ${name}, shared earlier]`);
    return { type: 'input_audio', input_audio: { data: base64, format } };
  }
  // Extracted text first: it is smaller than the file and every model reads it.
  if (hasPdfText(a)) {
    const header = a.name ? `[Document: ${a.name}]` : '[Document]';
    const pageInfo = a.pageCount ? ` (${a.pageCount} ${a.pageCount === 1 ? 'page' : 'pages'})` : '';
    return line(`${header}${pageInfo}\n\n${a.text}`);
  }
  if (!a.dataURL) return undefined;
  const filename = a.name || 'document.pdf';
  if (!replay.files) return line(`[Document: ${filename}, shared earlier]`);
  if (a.dataURL.length > MAX_PDF_PAYLOAD_BYTES) {
    return line(
      `[Document: ${filename}] (Unable to process: file too large for direct upload. Please try a smaller file or a text-based format.)`,
    );
  }
  return { type: 'file', file: { filename, file_data: a.dataURL } };
}

function tokensFor(a: PersistedAttachment, block: ModelContentBlock): number {
  switch (block.type) {
    case 'text':
      return estimateTokens(block.text) ?? 1;
    case 'image_url':
      return IMAGE_TOKENS;
    case 'input_audio':
      return AUDIO_TOKENS;
    case 'file': {
      const pages = a.pageCount || Math.ceil((a.size ?? 0) / PDF_BYTES_PER_PAGE) || 1;
      return pages * PDF_PAGE_TOKENS;
    }
    default:
      return 0;
  }
}

export class AttachmentProcessor {
  static process(
    attachments: PersistedAttachment[],
    replay: AttachmentReplay = IN_FULL,
  ): ModelContentBlock[] {
    const blocks: ModelContentBlock[] = [];
    for (const a of attachments) {
      const block = blockFor(a, replay);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  /** About how many tokens the attachments cost a request, sent as `replay` says. */
  static tokens(attachments: PersistedAttachment[], replay: AttachmentReplay = IN_FULL): number {
    let total = 0;
    for (const a of attachments) {
      const block = blockFor(a, replay);
      if (block) total += tokensFor(a, block);
    }
    return total;
  }

  /** Whether any of them goes as a file (an image, a recording, a PDF without text) when sent in full. */
  static carriesFiles(
    attachments: PersistedAttachment[],
    replay: Omit<AttachmentReplay, 'files'>,
  ): boolean {
    return attachments.some((a) => {
      const block = blockFor(a, { ...replay, files: true });
      return !!block && block.type !== 'text';
    });
  }
}
