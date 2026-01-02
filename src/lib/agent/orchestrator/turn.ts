import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type {
  ComposeTurnArgs,
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  TurnComposition,
  TurnContext,
  StreamFinalOptions,
  ResolvedTurnSettings,
} from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';

type ComposeFn = (args: ComposeTurnArgs) => Promise<TurnComposition>;
type PlanFn = (args: PlanTurnOptions) => Promise<PlanTurnResult>;
type StreamFn = (args: StreamFinalOptions) => Promise<void>;
type BaseTurnContext = Omit<TurnContext, 'auth'>;

export type RunTurnHooks = {
  onComposition?: (composition: TurnComposition) => void;
  onPlanResult?: (plan: PlanTurnResult) => void;
  beforeStream?: (args: { composition: TurnComposition; plan?: PlanTurnResult }) => void;
};

export type AuthResolver = (modelId: string) => TransportAuth | null;

export type AttachmentPreparer = (modelId: string) => Promise<PersistedAttachment[]>;

export type RunTurnArgs = {
  chat: Chat;
  chatId: string;
  modelId: string;
  userContent: string;
  assistantMessage: Message;
  priorMessages: Message[];
  ui: UiSnapshot;
  settings: ResolvedTurnSettings;
  controller: AbortController;
  baseTurnContext: BaseTurnContext;
  compose: ComposeFn;
  plan: PlanFn;
  streamFinal: StreamFn;
  authResolver: AuthResolver;
  attachmentPreparer?: AttachmentPreparer;
  fallbackAttachments?: PersistedAttachment[];
  shouldShortCircuit?: (plan: PlanTurnResult) => boolean;
  hooks?: RunTurnHooks;
  startBuffered?: boolean;
};

export type RunTurnResult = {
  composition: TurnComposition;
  plan?: PlanTurnResult;
  shortCircuited: boolean;
};

const buildStreamMessages = (
  composition: TurnComposition,
  plan?: PlanTurnResult,
): ModelMessage[] => {
  if (composition.shouldPlan && plan?.finalSystem) {
    const withoutSystem = composition.messages.filter((msg) => msg.role !== 'system');
    return [{ role: 'system', content: plan.finalSystem } as ModelMessage, ...withoutSystem];
  }
  return composition.messages;
};

export const runTurn = async ({
  chat,
  chatId,
  modelId,
  userContent,
  assistantMessage,
  priorMessages,
  ui,
  settings,
  controller,
  baseTurnContext,
  compose,
  plan,
  streamFinal,
  authResolver,
  attachmentPreparer,
  fallbackAttachments,
  shouldShortCircuit,
  hooks,
  startBuffered = false,
}: RunTurnArgs): Promise<RunTurnResult> => {
  const attachments = attachmentPreparer
    ? await attachmentPreparer(modelId)
    : (fallbackAttachments ?? []);

  const composition = await compose({
    chat,
    ui,
    settings,
    modelIndex: baseTurnContext.modelIndex,
    prior: priorMessages,
    newUser: { content: userContent, attachments },
    attachments,
  });
  hooks?.onComposition?.(composition);

  const auth = authResolver(modelId);
  if (!auth) {
    throw new Error(`Missing auth for model ${modelId}`);
  }
  const turnContext: TurnContext = {
    ...baseTurnContext,
    auth,
  };

  let planResult: PlanTurnResult | undefined;
  if (composition.shouldPlan) {
    planResult = await plan({
      chat,
      chatId,
      assistantMessage,
      userContent,
      combinedSystem: composition.system,
      baseMessages: composition.messages,
      toolDefinition: composition.tools,
      controller,
      turn: turnContext,
      settings: composition.settings,
    });
    hooks?.onPlanResult?.(planResult);

    if (shouldShortCircuit?.(planResult)) {
      return { composition, plan: planResult, shortCircuited: true };
    }
  }

  hooks?.beforeStream?.({ composition, plan: planResult });

  const messages = buildStreamMessages(composition, planResult);
  await streamFinal({
    chat,
    chatId,
    assistantMessage,
    messages,
    controller,
    turn: turnContext,
    settings: composition.settings,
    plugins: composition.plugins,
    toolDefinition: composition.tools,
    startBuffered,
  });

  return { composition, plan: planResult, shortCircuited: false };
};
