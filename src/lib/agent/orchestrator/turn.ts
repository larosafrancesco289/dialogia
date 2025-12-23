import type { Attachment, Chat, Message, ModelTransport } from '@/lib/types';
import type { UIState } from '@/lib/store/types';
import type {
  ComposeTurnArgs,
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  TurnComposition,
  TurnContext,
  StreamFinalOptions,
} from '@/lib/agent/types';

type ComposeFn = (args: ComposeTurnArgs) => Promise<TurnComposition>;
type PlanFn = (args: PlanTurnOptions) => Promise<PlanTurnResult>;
type StreamFn = (args: StreamFinalOptions) => Promise<void>;
type BaseTurnContext = Omit<TurnContext, 'apiKey' | 'transport'>;

export type RunTurnHooks = {
  onComposition?: (composition: TurnComposition) => void;
  onPlanResult?: (plan: PlanTurnResult) => void;
  beforeStream?: (args: { composition: TurnComposition; plan?: PlanTurnResult }) => void;
};

export type AuthResolver = (modelId: string) => {
  transport: ModelTransport;
  apiKey: string;
} | null;

export type AttachmentPreparer = (modelId: string) => Promise<Attachment[]>;

export type RunTurnArgs = {
  chat: Chat;
  chatId: string;
  modelId: string;
  userContent: string;
  assistantMessage: Message;
  priorMessages: Message[];
  ui: UIState;
  controller: AbortController;
  baseTurnContext: BaseTurnContext;
  compose: ComposeFn;
  plan: PlanFn;
  streamFinal: StreamFn;
  authResolver: AuthResolver;
  attachmentPreparer?: AttachmentPreparer;
  fallbackAttachments?: Attachment[];
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
    apiKey: auth.apiKey,
    transport: auth.transport,
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
      searchEnabled: composition.search.enabled,
      searchProvider: composition.search.provider,
      providerSort: composition.providerSort,
      controller,
      turn: turnContext,
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
    providerSort: composition.providerSort,
    turn: turnContext,
    plugins: composition.plugins,
    toolDefinition: composition.tools,
    startBuffered,
  });

  return { composition, plan: planResult, shortCircuited: false };
};
