// Module: speech/chunks
// Responsibility: Text cut into pieces short enough to be spoken one by one.
// Chrome stops an utterance that runs past about fifteen seconds without a
// word, so a reply is read a sentence at a time.

/** About twelve seconds of speech at the default rate. */
const MAX_CHUNK_CHARS = 220;

// A break is the space after the mark, so "3.14" and "1,000" stay whole.
const SENTENCE_BREAK_RE = /(?<=[.!?…]["'”’»)\]]*)\s+/u;
const CLAUSE_BREAK_RE = /(?<=[,;:])\s+/;

function pieces(text: string, breaks: RegExp): string[] {
  return text
    .split(breaks)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/** Pieces joined back together while they fit in `max`. */
function pack(parts: string[], max: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    const joined = current ? `${current} ${part}` : part;
    if (joined.length <= max) {
      current = joined;
      continue;
    }
    if (current) out.push(current);
    current = part;
  }
  if (current) out.push(current);
  return out;
}

/** Words packed up to `max`, and a word longer than that cut where it must be. */
function byWords(text: string, max: number): string[] {
  const words = text.split(/\s+/).flatMap((word) => {
    if (word.length <= max) return [word];
    const cuts: string[] = [];
    for (let at = 0; at < word.length; at += max) cuts.push(word.slice(at, at + max));
    return cuts;
  });
  return pack(words, max);
}

/** A sentence too long to say in one go, cut at its commas, then between words. */
function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const clauses = pieces(sentence, CLAUSE_BREAK_RE).flatMap((clause) =>
    clause.length <= max ? [clause] : byWords(clause, max),
  );
  return pack(clauses, max);
}

/**
 * The text as it will be spoken, in order: each line and each sentence a
 * piece of its own, a sentence longer than `max` characters cut at commas,
 * semicolons and colons, then between words.
 */
export function speechChunks(text: string, max: number = MAX_CHUNK_CHARS): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => pieces(line, SENTENCE_BREAK_RE))
    .flatMap((sentence) => splitLong(sentence, max));
}
