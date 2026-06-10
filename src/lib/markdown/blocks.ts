// Module: markdown/blocks
// Responsibility: Split streaming markdown into stable, independently renderable
// blocks plus a trailing in-progress block, so the UI can memoize completed
// blocks and only re-parse the tail on each stream flush.

const FENCE_RE = /^ {0,3}(```|~~~)/;
// Lines that continue a construct from the previous segment (lists, quotes,
// tables, indented code). Splitting before these could change list numbering
// or break tables, so such segments are merged into the previous block.
const CONTINUATION_RE = /^ {0,3}(?:[-*+] |\d{1,9}[.)] |>|\|)| {4,}\S/;

export type MarkdownBlockSplit = {
  /** Completed blocks whose content will never change as the stream grows. */
  stable: string[];
  /** The in-progress trailing block (may be empty). */
  tail: string;
};

/**
 * Split markdown into blocks at blank lines outside fenced code, preserving
 * the original text exactly (stable.join('') + tail === content). The final
 * segment is always returned as the tail since it may still be growing.
 */
export function splitMarkdownBlocks(content: string): MarkdownBlockSplit {
  if (!content) return { stable: [], tail: '' };

  const segments: string[] = [];
  let current = '';
  let inFence = false;
  let fenceMarker = '';
  let inMathFence = false;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    const withNewline = isLast ? line : `${line}\n`;

    if (inFence) {
      current += withNewline;
      const close = line.match(FENCE_RE);
      if (close && close[1].startsWith(fenceMarker[0]) && close[1].length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }

    const open = line.match(FENCE_RE);
    if (open) {
      current += withNewline;
      inFence = true;
      fenceMarker = open[1];
      continue;
    }

    if (/^ {0,3}\$\$\s*$/.test(line)) {
      current += withNewline;
      inMathFence = !inMathFence;
      continue;
    }
    if (inMathFence) {
      current += withNewline;
      continue;
    }

    if (line.trim() === '' && current.trim() !== '') {
      // Blank line ends the current block; trailing blank lines stay attached
      // to it so concatenation reproduces the source exactly.
      current += withNewline;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') {
        current += j === lines.length - 1 ? lines[j] : `${lines[j]}\n`;
        j += 1;
      }
      i = j - 1;
      segments.push(current);
      current = '';
      continue;
    }

    current += withNewline;
  }
  if (current) segments.push(current);

  // Merge continuation-looking segments so loose lists, tables, and quotes
  // stay within a single parse unit.
  const merged: string[] = [];
  for (const segment of segments) {
    const firstLine = segment.replace(/^\n+/, '').split('\n', 1)[0] ?? '';
    if (merged.length > 0 && CONTINUATION_RE.test(firstLine)) {
      merged[merged.length - 1] += segment;
    } else {
      merged.push(segment);
    }
  }

  const tail = merged.pop() ?? '';
  return { stable: merged, tail };
}
