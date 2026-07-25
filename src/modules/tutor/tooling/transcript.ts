import type { HeadlessTurnSnapshot } from '@/modules/tutor/tooling/types';
import type { Message } from '@/lib/types';

export type TranscriptRenderOptions = {
  includeHiddenContent?: boolean;
};

export function renderTutorTranscript(
  messages: Message[],
  options?: TranscriptRenderOptions,
): string {
  const includeHidden = options?.includeHiddenContent ?? true;
  return messages
    .map((msg) => {
      const role = msg.role === 'assistant' ? 'Tutor' : msg.role === 'user' ? 'Student' : 'System';
      const timestamp = msg.createdAt ? new Date(msg.createdAt).toISOString() : undefined;
      const hidden =
        includeHidden &&
        msg.role === 'assistant' &&
        typeof msg.hiddenContent === 'string' &&
        msg.hiddenContent.trim().length > 0
          ? `\n[Tutor Hidden Content]\n${msg.hiddenContent}`
          : '';
      const prefix = timestamp ? `${role} (${timestamp})` : role;
      return `${prefix}:\n${msg.content}${hidden}`;
    })
    .join('\n\n');
}

export function renderSnapshotTranscript(
  snapshots: HeadlessTurnSnapshot[],
  options?: TranscriptRenderOptions,
): string {
  const ordered = [...snapshots].sort((a, b) => a.turnIndex - b.turnIndex);
  const messages: Message[] = [];

  ordered.forEach((snapshot) => {
    messages.push({
      id: snapshot.user.id,
      chatId: snapshot.chatId,
      role: 'user',
      content: snapshot.user.content,
      createdAt: snapshot.user.createdAt,
    });
    messages.push({
      id: snapshot.assistant.id,
      chatId: snapshot.chatId,
      role: 'assistant',
      content: snapshot.assistant.content,
      createdAt: snapshot.assistant.createdAt ?? snapshot.user.createdAt + 1,
      hiddenContent: snapshot.assistant.hiddenContent,
    });
  });

  return renderTutorTranscript(messages, options);
}
