import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAttachmentsForModel } from '@/lib/attachments/prepare';
import { AttachmentProcessor } from '@/lib/attachments/prompt';
import type { DraftAttachment, ModelDescriptor, PersistedAttachment } from '@/lib/types';

const PDF_DATA_URL = `data:application/pdf;base64,${'A'.repeat(1000)}`;
let reads = 0;
const realFileReader = (globalThis as { FileReader?: unknown }).FileReader;

beforeEach(() => {
  reads = 0;
  (globalThis as { FileReader?: unknown }).FileReader = class {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      reads += 1;
      this.result = PDF_DATA_URL;
      this.onload?.();
    }
  };
});

afterEach(() => {
  (globalThis as { FileReader?: unknown }).FileReader = realFileReader;
});

const MODEL: ModelDescriptor = {
  id: 'm',
  name: 'Model',
  raw: { supported_parameters: ['audio', 'vision'] },
};

const prepare = async (attachments: DraftAttachment[], model = MODEL) =>
  (await prepareAttachmentsForModel({ attachments, modelId: model.id, models: [model] }))
    .attachments;

const pdf = (fields: Partial<DraftAttachment>): DraftAttachment => ({
  id: 'p',
  kind: 'pdf',
  name: 'a.pdf',
  mime: 'application/pdf',
  size: 750,
  file: { size: 750 } as File,
  ...fields,
});

test('a PDF whose text was read is stored as its text alone', async () => {
  const [stored] = await prepare([pdf({ text: 'Chapter one', pageCount: 1 })]);
  assert.equal(stored?.text, 'Chapter one');
  assert.equal(stored?.dataURL, undefined);
  assert.equal('file' in (stored ?? {}), false);
  assert.equal(reads, 0, 'the file is not even read');
});

test('a PDF with no text read keeps its file, for the model to read itself', async () => {
  const [scan] = await prepare([pdf({ text: '\n \n', pageCount: 2 })]);
  assert.equal(scan?.dataURL, PDF_DATA_URL);
  const [unread] = await prepare([pdf({})]);
  assert.equal(unread?.dataURL, PDF_DATA_URL);
});

test('audio is stored once, as its data URL, and the model is still sent its base64', async () => {
  const [stored] = await prepare([
    {
      id: 'au',
      kind: 'audio',
      name: 'a.mp3',
      mime: 'audio/mpeg',
      size: 3,
      dataURL: 'data:audio/mpeg;base64,QUJD',
      file: { size: 3 } as File,
    },
  ]);
  assert.equal(stored?.dataURL, 'data:audio/mpeg;base64,QUJD');
  assert.equal(stored?.base64, undefined);
  assert.equal(stored?.audioFormat, 'mp3');
  assert.deepEqual(AttachmentProcessor.process([stored!]), [
    { type: 'input_audio', input_audio: { data: 'QUJD', format: 'mp3' } },
  ]);
});

test('attachments stored twice before are read as they are', () => {
  const old: PersistedAttachment[] = [
    {
      id: 'p',
      kind: 'pdf',
      name: 'old.pdf',
      mime: 'application/pdf',
      text: 'Kept text',
      dataURL: PDF_DATA_URL,
    },
    {
      id: 'au',
      kind: 'audio',
      name: 'old.wav',
      mime: 'audio/wav',
      base64: 'V0FW',
      audioFormat: 'wav',
    },
  ];
  assert.deepEqual(AttachmentProcessor.process(old), [
    { type: 'text', text: '[Document: old.pdf]\n\nKept text' },
    { type: 'input_audio', input_audio: { data: 'V0FW', format: 'wav' } },
  ]);
});

test('a kind the model cannot take is left out and named', async () => {
  const textOnly: ModelDescriptor = { id: 't', name: 'Text only', raw: {} };
  const prepared = await prepareAttachmentsForModel({
    attachments: [
      {
        id: 'i',
        kind: 'image',
        name: 'x.png',
        mime: 'image/png',
        dataURL: 'data:image/png;base64,AA',
      },
      pdf({ text: 'Words' }),
    ],
    modelId: textOnly.id,
    models: [textOnly],
  });
  assert.deepEqual(
    prepared.attachments.map((a) => a.kind),
    ['pdf'],
  );
  assert.deepEqual(prepared.droppedKinds, ['image']);
});
