import type { StoreApi } from 'zustand/vanilla';
import { HeadlessTutorSession, type ApiKeyResolver } from '@/lib/headless/session';
import {
  buildHeadlessTurnSnapshot,
  type HeadlessTurnSnapshot,
} from '@/lib/headless/types';
import type { Chat, Message, ORModel } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import type { StoreState, UIState } from '@/lib/store/types';

export type HeadlessRunOptions = {
  chat: Chat;
  models?: ORModel[];
  modelIndex?: ModelIndex;
  uiOverrides?: Partial<UIState>;
  initialMessages?: Message[];
  resolveApiKey: ApiKeyResolver;
  store?: StoreApi<StoreState>;
  session?: HeadlessTutorSession;
};

export type HeadlessRunTurnOptions = {
  content: string;
  turnIndex?: number;
};

export type HeadlessRunResult = {
  snapshots: HeadlessTurnSnapshot[];
  messages: Message[];
};

export type HeadlessRunner = {
  runTurn: (options: HeadlessRunTurnOptions) => Promise<HeadlessTurnSnapshot>;
  getSnapshots: () => HeadlessTurnSnapshot[];
  getMessages: () => Message[];
  toResult: () => HeadlessRunResult;
  getSession: () => HeadlessTutorSession;
};

export function createHeadlessRunner(options: HeadlessRunOptions): HeadlessRunner {
  const session =
    options.session ??
    new HeadlessTutorSession({
      chat: options.chat,
      models: options.models,
      modelIndex: options.modelIndex,
      uiOverrides: options.uiOverrides,
      initialMessages: options.initialMessages,
      resolveApiKey: options.resolveApiKey,
      store: options.store,
    });

  const snapshots: HeadlessTurnSnapshot[] = [];

  const runTurn = async ({ content, turnIndex }: HeadlessRunTurnOptions) => {
    const result = await session.runTurn(content);
    const snapshotIndex = typeof turnIndex === 'number' ? turnIndex : snapshots.length;
    const snapshot = buildHeadlessTurnSnapshot(
      session.getState(),
      result.assistant.chatId,
      result.assistant.id,
      result.artifacts,
      snapshotIndex,
    );
    snapshots.push(snapshot);
    return snapshot;
  };

  const getSnapshots = () => snapshots.slice();
  const getMessages = () => session.getMessages();

  const toResult = (): HeadlessRunResult => ({
    snapshots: snapshots.slice(),
    messages: session.getMessages(),
  });

  return {
    runTurn,
    getSnapshots,
    getMessages,
    toResult,
    getSession: () => session,
  };
}
