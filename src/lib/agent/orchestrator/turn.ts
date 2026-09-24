import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type {
  ComposeTurnArgs,
  PlanTurnResult,
  PlanTurnSideEffect,
  TurnComposition,
  TurnContext,
  StreamFinalOptions,
  ResolvedTurnSettings,
} from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';

type ComposeFn = (args: ComposeTurnArgs) => Promise<TurnComposition>;
type StreamFn = (args: StreamFinalOptions) => Promise<void>;
type BaseTurnContext = Omit<TurnContext, 'auth'>;

export type RunTurnHooks = {
  onComposition?: (composition: TurnComposition) => void;
  onPlanResult?: (plan: PlanTurnResult) => void;
  onPlanSideEffects?: (effects: PlanTurnSideEffect[]) => void;
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
  streamFinal: StreamFn;
  authResolver: AuthResolver;
  attachmentPreparer?: AttachmentPreparer;
  fallbackAttachments?: PersistedAttachment[];
  hooks?: RunTurnHooks;
  startBuffered?: boolean;
  pipeline?: PipelineClient;
};

export type RunTurnResult = {
  composition: TurnComposition;
  plan?: PlanTurnResult;
  shortCircuited: boolean;
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
  streamFinal,
  authResolver,
  attachmentPreparer,
  fallbackAttachments,
  hooks,
  startBuffered = false,
  pipeline,
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
    store: { set: baseTurnContext.set, get: baseTurnContext.get },
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

  // Tool search and agent-loop modules run as one streaming call that drafts,
  // runs tools and answers; everything else is a plain stream.
  const hasTools = Array.isArray(composition.tools) && composition.tools.length > 0;
  const agentLoop = composition.loop === 'agent';
  if ((composition.shouldPlan || agentLoop) && hasTools) {
    hooks?.beforeStream?.({ composition, plan: undefined });

    const streamingResult = await executeStreamingTurn({
      chat,
      chatId,
      assistantMessage,
      messages: composition.messages,
      controller,
      turn: turnContext,
      settings: composition.settings,
      plugins: composition.plugins,
      toolDefinition: composition.tools,
      ...(composition.refreshTools ? { refreshTools: composition.refreshTools } : {}),
      startBuffered,
      userContent,
      combinedSystem: composition.system,
      systemStable: composition.systemStable,
      systemDynamic: composition.systemDynamic,
      pipeline,
      loop: composition.loop,
      onPlanResult: hooks?.onPlanResult,
      onPlanSideEffects: hooks?.onPlanSideEffects,
    });

    const plan: PlanTurnResult = {
      finalSystem: streamingResult.finalSystem,
      usedContentTool: streamingResult.usedContentTool,
      hasSearchResults: streamingResult.hasSearchResults,
    };
    return { composition, plan, shortCircuited: !!streamingResult.shortCircuited };
  }

  hooks?.beforeStream?.({ composition });

  await streamFinal({
    chat,
    chatId,
    assistantMessage,
    messages: composition.messages,
    controller,
    turn: turnContext,
    settings: composition.settings,
    plugins: composition.plugins,
    toolDefinition: composition.tools,
    startBuffered,
    systemStable: composition.systemStable,
    systemDynamic: composition.systemDynamic,
  });

  return { composition, shortCircuited: false };
};
