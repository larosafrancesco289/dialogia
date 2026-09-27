// Module: openrouter/thinkTags
// Responsibility: A local server with no reasoning parser (Ollama, LM Studio,
// llama.cpp) sends a reasoning model's thinking inside the reply as a leading
// `<think>…</think>`. That is reasoning, not words for the reader: it belongs
// on the ledger, where `reasoning_content` from a server that does parse lands.

const OPEN = '<think>';
const CLOSE = '</think>';

type Split = { content: string; reasoning: string };

/** How much of the end of `text` could be the start of `tag`, still arriving. */
function partialTagLength(text: string, tag: string): number {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (tag.startsWith(text.slice(-length))) return length;
  }
  return 0;
}

/**
 * Splits a streamed reply's leading `<think>` block out of its content, a
 * chunk at a time; a tag split across chunks is held until it is whole. Only
 * a block that opens the reply counts: a `<think>` mid-answer is the model
 * writing about the tag. `flush` hands back whatever is still held at the end.
 */
export function createThinkSplitter() {
  let state: 'start' | 'thinking' | 'content' = 'start';
  let held = '';

  const push = (chunk: string): Split => {
    if (state === 'content') return { content: chunk, reasoning: '' };
    held += chunk;
    if (state === 'start') {
      const lead = held.trimStart();
      if (lead.length < OPEN.length && OPEN.startsWith(lead)) return { content: '', reasoning: '' };
      if (!lead.startsWith(OPEN)) {
        state = 'content';
        const content = held;
        held = '';
        return { content, reasoning: '' };
      }
      state = 'thinking';
      held = lead.slice(OPEN.length).replace(/^\s+/, '');
    }
    const close = held.indexOf(CLOSE);
    if (close === -1) {
      // Whitespace is held too, in case the block closes right after it.
      const tag = partialTagLength(held, CLOSE);
      const keep = held.length - held.slice(0, held.length - tag).trimEnd().length;
      const reasoning = held.slice(0, held.length - keep);
      held = held.slice(held.length - keep);
      return { content: '', reasoning };
    }
    const reasoning = held.slice(0, close).replace(/\s+$/, '');
    const content = held.slice(close + CLOSE.length).replace(/^\s+/, '');
    held = '';
    state = 'content';
    return { content, reasoning };
  };

  const flush = (): Split => {
    const rest = held;
    held = '';
    if (state === 'thinking') return { content: '', reasoning: rest.trimEnd() };
    return { content: rest, reasoning: '' };
  };

  return { push, flush };
}

/** A whole reply without its leading `<think>` block (an unclosed one is all thinking). */
export function stripThinkBlock(text: string): string {
  const splitter = createThinkSplitter();
  return splitter.push(text).content + splitter.flush().content;
}
