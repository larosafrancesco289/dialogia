type AttachmentBase = {
  id: string;
  kind: 'image' | 'pdf' | 'audio' | 'text';
  name?: string;
  mime: string; // e.g., image/png, image/jpeg, image/webp, application/pdf, text/plain
  size?: number; // bytes
  // image-only
  width?: number;
  height?: number;
  // image/audio data URL for preview (data:... or blob:)
  dataURL?: string;
  // pdf-only
  pageCount?: number;
  // extracted plain text (pdf or text file); trimmed/selected later for prompt
  text?: string;
  // audio-only: base64-encoded payload (no data: prefix), and format hint for OpenRouter
  base64?: string;
  audioFormat?: 'wav' | 'mp3';
};

export type DraftAttachment = AttachmentBase & {
  // ephemeral: original file handle available in composer before sending
  file?: File;
};

export type PersistedAttachment = AttachmentBase & {
  file?: never;
};
