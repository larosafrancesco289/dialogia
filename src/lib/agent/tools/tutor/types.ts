import type {
  Chat,
  LearnerModel,
  LearningPlan,
  LearnerModelDebugSnapshot,
  Message,
} from '@/lib/types';
import type { PersistMessage, StoreGetter, StoreSetter } from '@/lib/agent/types';

export type TutorToolApplyResult = {
  handled: boolean;
  usedContent: boolean;
  error?: string;
  payload?: string;
  learnerModel?: LearnerModel;
  planUpdates?: Message['planUpdates'];
  updatedPlan?: LearningPlan;
  learnerModelDebug?: LearnerModelDebugSnapshot;
};

export type TutorToolContext = {
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: PersistMessage;
  applyTutorPatch: (
    buildPatch: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) => Promise<Message | undefined>;
  /**
   * Get the current learning plan, accounting for updates from previous tool calls in the same turn.
   * Falls back to chat.settings.features.tutor.learningPlan if not provided.
   */
  getCurrentPlan?: () => LearningPlan | undefined;
};

export type TutorToolHandler<Args> = {
  parseArgs: (input: unknown) => Args | null;
  apply: (ctx: TutorToolContext, args: Args) => Promise<TutorToolApplyResult>;
};
