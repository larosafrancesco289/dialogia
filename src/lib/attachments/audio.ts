export type AudioFormat = 'wav' | 'mp3';

export function detectAudioFormatFromFile(file: File): AudioFormat | undefined {
  const name = file.name.toLowerCase();
  if (file.type.includes('wav') || name.endsWith('.wav')) return 'wav';
  if (file.type.includes('mpeg') || file.type.includes('mp3') || name.endsWith('.mp3'))
    return 'mp3';
  return undefined;
}

export function detectAudioFormatFromAttachment(attachment: {
  audioFormat?: string;
  mime?: string;
  name?: string;
}): AudioFormat | undefined {
  if (attachment.audioFormat === 'wav' || attachment.audioFormat === 'mp3') {
    return attachment.audioFormat;
  }
  if (attachment.mime?.includes('wav')) return 'wav';
  if (attachment.mime?.includes('mpeg') || attachment.mime?.includes('mp3')) return 'mp3';
  const name = (attachment.name || '').toLowerCase();
  if (name.endsWith('.wav')) return 'wav';
  if (name.endsWith('.mp3')) return 'mp3';
  return undefined;
}

export function extractBase64FromDataUrl(dataUrl: string | undefined): string | undefined {
  if (!dataUrl) return undefined;
  const idx = dataUrl.indexOf('base64,');
  return idx >= 0 ? dataUrl.slice(idx + 'base64,'.length) : undefined;
}
