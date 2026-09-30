// Module: messages/versions
// Responsibility: A reply's versions from Try again. The shown version lives in the
// message's own fields, so everything that reads a message (the transcript, the
// request, export, other tabs) sees that one; the rest wait in `versions`.

import type { Message, ReplyVersion, ReplyVersionKey } from '@/lib/types';

// A record, so the compiler holds this list and `ReplyVersionKey` to each other.
const VERSION_KEYS = Object.keys({
  content: true,
  hiddenContent: true,
  systemSnapshot: true,
  genSettings: true,
  annotations: true,
  searchSources: true,
  memoryWrites: true,
  finishReason: true,
  stopPolicy: true,
  cutOff: true,
  tokensIn: true,
  tokensOut: true,
  model: true,
  reasoning: true,
  metrics: true,
  usage: true,
  attachments: true,
  toolCalls: true,
  activity: true,
  toolRounds: true,
  tutorSeq: true,
} satisfies Record<ReplyVersionKey, true>) as ReplyVersionKey[];

/** Whether a reply has anything to show: words, thoughts, tool calls or files. */
export const hasOutput = (message: Pick<Message, ReplyVersionKey>): boolean =>
  !!message.content?.trim() ||
  !!message.reasoning?.trim() ||
  !!message.toolCalls?.length ||
  !!message.attachments?.length;

/** The fields of a message that belong to its shown version. */
export function versionOf(message: Message): ReplyVersion {
  const version: Record<string, unknown> = {};
  for (const key of VERSION_KEYS) {
    if (message[key] !== undefined) version[key] = message[key];
  }
  return version as ReplyVersion;
}

/** Every version in order, the shown one among them. */
function allVersions(message: Message): ReplyVersion[] {
  const others = message.versions ?? [];
  const at = shownVersionIndex(message);
  return [...others.slice(0, at), versionOf(message), ...others.slice(at)];
}

/** The message showing `list[index]`, the rest kept as its other versions. */
function withVersions(message: Message, list: ReplyVersion[], index: number): Message {
  const bare: Record<string, unknown> = { ...message };
  for (const key of VERSION_KEYS) delete bare[key];
  delete bare.versions;
  delete bare.versionIndex;
  const next = { ...bare, ...list[index] } as Message;
  if (list.length < 2) return next;
  next.versions = list.filter((_, i) => i !== index);
  // Last is the default, so a reply only just tried again carries no index.
  if (index !== list.length - 1) next.versionIndex = index;
  return next;
}

export function versionCount(message: Message): number {
  return (message.versions?.length ?? 0) + 1;
}

export function shownVersionIndex(message: Message): number {
  const others = message.versions?.length ?? 0;
  const at = message.versionIndex;
  return typeof at === 'number' && Number.isInteger(at) && at >= 0 && at <= others ? at : others;
}

/**
 * The fresh attempt `next` shown as the reply's newest version, the earlier
 * ones kept. A shown version with nothing in it (a failed turn) is not worth
 * keeping, and the attempt takes its place.
 */
export function addVersion(original: Message, next: Message): Message {
  const earlier = allVersions(original);
  if (!hasOutput(original)) earlier.splice(shownVersionIndex(original), 1);
  return withVersions(next, [...earlier, versionOf(next)], earlier.length);
}

/** The reply showing its version at `index`; the same message when there is none. */
export function showVersion(message: Message, index: number): Message {
  if (index === shownVersionIndex(message) || index < 0 || index >= versionCount(message)) {
    return message;
  }
  return withVersions(message, allVersions(message), index);
}

/**
 * The reply without its shown version, showing the one before it (the next
 * one when it was the first). The same message when it has only the one.
 */
export function removeShownVersion(message: Message): Message {
  if (versionCount(message) < 2) return message;
  const at = shownVersionIndex(message);
  const rest = allVersions(message).filter((_, i) => i !== at);
  return withVersions(message, rest, Math.max(0, at - 1));
}

/** The reply as its shown version alone, for a copy that starts a new chat. */
export function onlyShownVersion(message: Message): Message {
  if (!message.versions && message.versionIndex === undefined) return message;
  const { versions: _versions, versionIndex: _versionIndex, ...rest } = message;
  return rest;
}
