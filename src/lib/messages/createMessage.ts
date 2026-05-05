import { v4 as uuidv4 } from 'uuid';
import type { Message, PersistedAttachment } from '@/lib/types';

type BaseMessageArgs = {
  id?: string;
  chatId: string;
  createdAt?: number;
};

export type CreateUserMessageArgs = BaseMessageArgs & {
  content: string;
  attachments?: PersistedAttachment[];
  metadata?: Message['metadata'];
};

export function createUserMessage(args: CreateUserMessageArgs): Message {
  const { id = uuidv4(), chatId, createdAt = Date.now(), content, attachments, metadata } = args;

  return {
    id,
    chatId,
    role: 'user',
    content,
    createdAt,
    ...(attachments && attachments.length ? { attachments } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export type CreateAssistantMessageArgs = BaseMessageArgs & {
  content: string;
  model?: string;
  reasoning?: string;
  activity?: Message['activity'];
  attachments?: PersistedAttachment[];
  toolCalls?: Message['toolCalls'];
  metadata?: Message['metadata'];
  systemSnapshot?: Message['systemSnapshot'];
  genSettings?: Message['genSettings'];
  hiddenContent?: Message['hiddenContent'];
  tutor?: Message['tutor'];
  tutorWelcome?: Message['tutorWelcome'];
};

export function createAssistantMessage(args: CreateAssistantMessageArgs): Message {
  const {
    id = uuidv4(),
    chatId,
    createdAt = Date.now(),
    content,
    model,
    reasoning = '',
    activity,
    attachments,
    toolCalls,
    metadata,
    systemSnapshot,
    genSettings,
    hiddenContent,
    tutor,
    tutorWelcome,
  } = args;

  return {
    id,
    chatId,
    role: 'assistant',
    content,
    createdAt,
    model,
    reasoning,
    activity: activity ?? [],
    toolCalls: toolCalls ?? [],
    ...(attachments !== undefined ? { attachments } : {}),
    ...(metadata ? { metadata } : {}),
    ...(systemSnapshot ? { systemSnapshot } : {}),
    ...(genSettings ? { genSettings } : {}),
    ...(hiddenContent ? { hiddenContent } : {}),
    ...(tutor ? { tutor } : {}),
    ...(tutorWelcome ? { tutorWelcome } : {}),
  };
}

export type CreateTutorWelcomeMessageArgs = BaseMessageArgs & {
  content: string;
  model?: string;
};

export function createTutorWelcomeMessage(args: CreateTutorWelcomeMessageArgs): Message {
  return createAssistantMessage({
    ...args,
    tutorWelcome: true,
  });
}
