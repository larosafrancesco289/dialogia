// Module: historyImport/zip
// Responsibility: Take one file out of a .zip with what the browser already has
// (Blob slices and DecompressionStream), so a data export can be chosen whole.
// Only the directory at the end and the one entry are read, never the whole
// archive, which for an export with images can run to gigabytes.

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_COMMENT = 0xffff;

export type ZipRead = { ok: true; text: string } | { ok: false; reason: 'missing' | 'unsupported' };

/** A zip starts with a local header (or, empty, with the end record). */
export async function looksLikeZip(file: Blob): Promise<boolean> {
  const head = new DataView(await file.slice(0, 4).arrayBuffer());
  return head.byteLength === 4 && [LOCAL, EOCD].includes(head.getUint32(0, true));
}

const view = async (file: Blob, start: number, end: number) =>
  new DataView(await file.slice(start, end).arrayBuffer());

const u64 = (data: DataView, at: number) => Number(data.getBigUint64(at, true));

type Entry = { name: string; method: number; compressed: number; offset: number };

async function readDirectory(file: Blob): Promise<Entry[] | undefined> {
  const tailStart = Math.max(0, file.size - (22 + MAX_COMMENT));
  const tail = await view(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  let count = tail.getUint16(eocd + 10, true);
  let size = tail.getUint32(eocd + 12, true);
  let start = tail.getUint32(eocd + 16, true);
  if (eocd >= 20 && tail.getUint32(eocd - 20, true) === ZIP64_LOCATOR) {
    const at = u64(tail, eocd - 20 + 8);
    const record = await view(file, at, at + 56);
    if (record.getUint32(0, true) !== ZIP64_EOCD) return undefined;
    count = u64(record, 32);
    size = u64(record, 40);
    start = u64(record, 48);
  }

  const directory = await view(file, start, start + size);
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  let at = 0;
  for (let n = 0; n < count && at + 46 <= directory.byteLength; n++) {
    if (directory.getUint32(at, true) !== CENTRAL) return undefined;
    const method = directory.getUint16(at + 10, true);
    let compressed = directory.getUint32(at + 20, true);
    const uncompressed = directory.getUint32(at + 24, true);
    const nameLength = directory.getUint16(at + 28, true);
    const extraLength = directory.getUint16(at + 30, true);
    const commentLength = directory.getUint16(at + 32, true);
    let offset = directory.getUint32(at + 42, true);
    const nameStart = directory.byteOffset + at + 46;
    const name = decoder.decode(directory.buffer.slice(nameStart, nameStart + nameLength));
    // Zip64 keeps the sizes that overflowed in an extra field, in this order.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = directory.getUint16(extra, true);
      const length = directory.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressed === 0xffffffff) field += 8;
        if (compressed === 0xffffffff) {
          compressed = u64(directory, field);
          field += 8;
        }
        if (offset === 0xffffffff) offset = u64(directory, field);
      }
      extra += 4 + length;
    }
    entries.push({ name, method, compressed, offset });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** The text of the entry named `filename`, at the top of the archive or the nearest to it. */
export async function readZipText(file: Blob, filename: string): Promise<ZipRead> {
  const entries = await readDirectory(file);
  const matches = (entries ?? [])
    .filter((entry) => entry.name.split('/').pop() === filename)
    .sort((a, b) => a.name.length - b.name.length);
  const entry = matches[0];
  if (!entry) return { ok: false, reason: 'missing' };

  const local = await view(file, entry.offset, entry.offset + 30);
  if (local.getUint32(0, true) !== LOCAL) return { ok: false, reason: 'missing' };
  const dataStart = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const data = file.slice(dataStart, dataStart + entry.compressed);
  if (entry.method === 0) return { ok: true, text: await data.text() };
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
    return { ok: false, reason: 'unsupported' };
  }
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return { ok: true, text: await new Response(stream).text() };
}
