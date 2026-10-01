import {
  DEFAULT_MODEL_ID as CURATED_DEFAULT_MODEL_ID,
  DEFAULT_MODEL_NAME as CURATED_DEFAULT_MODEL_NAME,
  DEFAULT_TUTOR_MODEL_ID as CURATED_DEFAULT_TUTOR_MODEL_ID,
} from '@/data/curatedModels';

export const DEFAULT_MODEL_ID = CURATED_DEFAULT_MODEL_ID;
export const DEFAULT_MODEL_NAME = CURATED_DEFAULT_MODEL_NAME;
export const DEFAULT_TUTOR_MODEL_ID = CURATED_DEFAULT_TUTOR_MODEL_ID;

export const MAX_FALLBACK_RESULTS = 5;

// A tool call the person's Stop cut short: the ledger says so quietly, since
// nothing went wrong.
export const TOOL_CALL_STOPPED = 'Stopped';

// Attachments limits
export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_PDFS_PER_MESSAGE = 2;
export const MAX_AUDIO_PER_MESSAGE = 1;
export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_PDF_SIZE_MB = 15;
export const MAX_AUDIO_SIZE_MB = 15;
