import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortAttachmentPick, toPdfAttachment } from '@/lib/attachments/ui';

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 1000) => ({ name, type, size }) as File;
const none = { pdf: 0, image: 0, audio: 0 };
const names = (files: File[]) => files.map((f) => f.name);

test('a pick the model takes whole raises no notice', () => {
  const pick = sortAttachmentPick(
    [file('a.png', 'image/png'), file('b.pdf', 'application/pdf'), file('c.mp3', 'audio/mpeg')],
    { canVision: true, canAudio: true, existing: none },
  );
  assert.deepEqual(names(pick.images), ['a.png']);
  assert.deepEqual(names(pick.pdfs), ['b.pdf']);
  assert.deepEqual(names(pick.audio), ['c.mp3']);
  assert.equal(pick.notice, undefined);
});

test('every file left out is named once, in one notice, with why', () => {
  const pick = sortAttachmentPick(
    [
      file('notes.txt', 'text/plain'),
      file('huge.png', 'image/png', 30 * MB),
      file('one.pdf', 'application/pdf'),
      file('two.pdf', 'application/pdf'),
      file('three.pdf', 'application/pdf'),
      file('big.pdf', 'application/pdf', 16 * MB),
      file('photo.heic', 'image/heic'),
      file('data.csv', 'text/csv'),
    ],
    { canVision: true, canAudio: false, existing: none },
  );
  assert.deepEqual(names(pick.pdfs), ['one.pdf', 'two.pdf']);
  assert.deepEqual(pick.images, []);
  assert.equal(
    pick.notice,
    'Not attached: notes.txt and data.csv (this model takes images or PDFs); ' +
      'huge.png (too large, max 5 MB); three.pdf (only 2 PDFs per message); ' +
      'big.pdf (too large, max 15 MB); photo.heic (only PNG, JPEG, WebP or GIF images).',
  );
});

test('the per-message count includes what the draft already holds', () => {
  const pick = sortAttachmentPick(
    [file('a.png', 'image/png'), file('b.png', 'image/png'), file('c.png', 'image/png')],
    { canVision: true, canAudio: false, existing: { ...none, image: 2 } },
  );
  assert.deepEqual(names(pick.images), ['a.png', 'b.png']);
  assert.equal(pick.notice, 'Not attached: c.png (only 4 images per message).');
});

test('an image the model cannot see is refused by kind, not by size', () => {
  const pick = sortAttachmentPick([file('a.png', 'image/png', 30 * MB)], {
    canVision: false,
    canAudio: false,
    existing: none,
  });
  assert.equal(pick.notice, 'Not attached: a.png (this model takes PDFs).');
});

const read = (text: string) => async () => ({ text, pageCount: 2 });

test('a PDF with text is attached as its text, with nothing to say', async () => {
  const intake = await toPdfAttachment(file('notes.pdf', 'application/pdf'), read('Chapter one'));
  assert.equal(intake.attachment?.text, 'Chapter one');
  assert.equal(intake.attachment?.pageCount, 2);
  assert.equal(intake.notice, undefined);
});

test('a scanned PDF goes as a file, and the person is told only some models read it', async () => {
  const intake = await toPdfAttachment(file('scan.pdf', 'application/pdf'), read('\n \n\n'));
  assert.ok(intake.attachment);
  assert.equal(intake.attachment.text, undefined, 'whitespace is not sent as its text');
  assert.equal(
    intake.notice,
    'scan.pdf has no text to read (it may be a scan). It is sent as a file, which only some models can read.',
  );
});

test('a scanned PDF too large to send as a file is not attached', async () => {
  const intake = await toPdfAttachment(file('big-scan.pdf', 'application/pdf', 10 * MB), read(''));
  assert.equal(intake.attachment, undefined);
  assert.equal(
    intake.notice,
    'Not attached: big-scan.pdf (no text to read, and too large to send as a file).',
  );
});

test('a PDF locked by a password is not attached, and says how to fix it', async () => {
  const locked = Object.assign(new Error('No password given'), { name: 'PasswordException' });
  const intake = await toPdfAttachment(file('locked.pdf', 'application/pdf'), async () => {
    throw locked;
  });
  assert.equal(intake.attachment, undefined);
  assert.match(intake.notice ?? '', /^Not attached: locked\.pdf \(protected by a password;/);
});

test('a PDF that could not be read here still goes as a file', async () => {
  const intake = await toPdfAttachment(file('odd.pdf', 'application/pdf'), async () => {
    throw new Error('worker failed to load');
  });
  assert.ok(intake.attachment);
  assert.equal(intake.attachment.text, undefined);
  assert.equal(intake.notice, undefined);
});
