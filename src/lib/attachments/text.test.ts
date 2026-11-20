import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLines, isTextFile, looksBinary } from '@/lib/attachments/text';

test('isTextFile recognises text MIME types, source extensions, and common filenames', () => {
  assert.equal(isTextFile({ name: 'notes.txt', type: 'text/plain' }), true);
  assert.equal(isTextFile({ name: 'data.json', type: 'application/json' }), true);
  assert.equal(isTextFile({ name: 'app.tsx', type: '' }), true);
  assert.equal(isTextFile({ name: 'script.py', type: '' }), true);
  assert.equal(isTextFile({ name: 'Makefile', type: '' }), true);
  assert.equal(isTextFile({ name: 'Dockerfile', type: '' }), true);
});

test('isTextFile refuses binaries and never overrides image, audio or PDF MIME types', () => {
  assert.equal(isTextFile({ name: 'archive.zip', type: 'application/zip' }), false);
  assert.equal(isTextFile({ name: 'photo.heic', type: 'image/heic' }), false);
  assert.equal(isTextFile({ name: 'weird.txt', type: 'image/png' }), false);
  assert.equal(isTextFile({ name: 'clip.txt', type: 'audio/mpeg' }), false);
  assert.equal(isTextFile({ name: 'doc.txt', type: 'application/pdf' }), false);
  assert.equal(isTextFile({ name: 'noext', type: '' }), false);
});

test('looksBinary flags NUL bytes and accepts UTF-8 text', () => {
  assert.equal(looksBinary('hello\nworld'), false);
  assert.equal(looksBinary('a\u0000b'), true);
});

test('countLines counts lines with or without a trailing newline', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('one'), 1);
  assert.equal(countLines('one\n'), 1);
  assert.equal(countLines('one\ntwo\nthree\n'), 3);
  assert.equal(countLines('a\r\nb\r\nc'), 3);
});
