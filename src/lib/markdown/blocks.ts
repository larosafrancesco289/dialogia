// Module: markdown/blocks
// Responsibility: Split streaming markdown into stable, independently renderable
// blocks plus a trailing in-progress block, so the UI can memoize completed
// blocks and only re-parse the tail on each stream flush.

// CommonMark fences: an opener is three or more of one character (a backtick
// opener's info string holds no backtick); only a run of the same character,
// at least as long, with nothing after it, closes it.
const FENCE_OPEN_RE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// Lines that continue a construct from the previous segment (lists, quotes,
// tables, indented code, a list item's own later paragraphs). Splitting before
// these could change list numbering or break tables, so such segments are
// merged into the previous block. Merging is always safe: a bigger block only
// parses closer to how the whole document does.
const CONTINUATION_RE = /^(?:[ \t]+\S| {0,3}(?:[-*+] |\d{1,9}[.)] |>|\|))/;

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
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fenceMarker[0] && close[1].length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }

    const open = line.match(FENCE_OPEN_RE);
    if (open) {
      current += withNewline;
      inFence = true;
      fenceMarker = open[1];
      continue;
    }

    // `\[` and `\]` alone on a line fence display math too (see preprocess).
    if (/^ {0,3}(?:\$\$|\\\[|\\\])\s*$/.test(line)) {
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

/**
 * The blocks a reply renders as, in order, the tail last. A block's index is
 * its render key, so a block keeps its key as the stream grows past it, when
 * the tail turns into a completed block, and when the stream ends: React
 * reuses what it already rendered instead of rebuilding the reply.
 */
export function markdownRenderBlocks(content: string): string[] {
  const { stable, tail } = splitMarkdownBlocks(content);
  return tail ? [...stable, tail] : stable;
}

// A link reference or footnote definition: `[id]: url`, `[^1]: text`.
const DEFINITION_RE = /^ {0,3}\[[^\]\n]+\]:/m;

/**
 * Whether rendering block by block reads the same as parsing the whole
 * document. A definition can be used from any other block, so a document
 * with one (or with a line that could be one, even inside code) must be
 * parsed whole once it is finished.
 */
export function rendersAsBlocks(content: string): boolean {
  return !DEFINITION_RE.test(content);
}
