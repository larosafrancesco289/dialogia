// Module: agent/prompts/timestamps
// Responsibility: Per-message timestamp formatting and the system notice that
// explains the prefix. Timestamps live only in the outgoing payload, never in
// stored message content, so the feature can be toggled retroactively.

export function formatMessageTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Models sometimes mirror the prefix despite the notice telling them not to;
// strip it from assistant output so it never reaches stored content or the UI.
const LEADING_TIMESTAMP = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ?/;

export function stripLeadingTimestamp(text: string): string {
  return text.replace(LEADING_TIMESTAMP, '');
}

// True while a streamed head could still grow into a leading timestamp prefix,
// so the stream gate knows to keep buffering rather than emit or give up.
export function isPartialTimestampPrefix(text: string): boolean {
  const template = '[0000-00-00 00:00]';
  if (text.length >= template.length) return false;
  for (let i = 0; i < text.length; i++) {
    const expected = template[i];
    if (expected === '0') {
      if (text[i] < '0' || text[i] > '9') return false;
    } else if (text[i] !== expected) {
      return false;
    }
  }
  return true;
}

// Static text (no embedded "now") so the stable system prefix stays cacheable;
// the current time is carried by the newest message's prefix instead.
export function buildTimestampNotice(): string {
  return [
    'Each conversation message is prefixed with the local date and time it was sent, in [YYYY-MM-DD HH:MM] format.',
    'The prefix on the latest user message reflects the current date and time; trust it even if it is later than your training data.',
    'Use these timestamps for temporal context (gaps between messages, time of day), but never prefix your own replies with one.',
  ].join(' ');
}
