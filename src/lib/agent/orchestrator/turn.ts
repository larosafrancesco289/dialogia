import type { Chat, Message, PersistedAttachment } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type {
  ComposeTurnArgs,
  ModelMessage,
  PlanTurnOptions,
  PlanTurnResult,
  PlanTurnSideEffect,
  PlanTurnOutput,
  TurnComposition,
  TurnContext,
  StreamFinalOptions,
  ResolvedTurnSettings,
} from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';
import type { PipelineClient } from '@/lib/agent/pipelineClient';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';

type ComposeFn = (args: ComposeTurnArgs) => Promise<TurnComposition>;
type PlanFn = (args: PlanTurnOptions) => Promise<PlanTurnOutput>;
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
  plan: PlanFn;
  streamFinal: StreamFn;
  authResolver: AuthResolver;
  attachmentPreparer?: AttachmentPreparer;
  fallbackAttachments?: PersistedAttachment[];
  shouldShortCircuit?: (plan: PlanTurnResult) => boolean;
  hooks?: RunTurnHooks;
  startBuffered?: boolean;
  pipeline?: PipelineClient;
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
  let planSideEffects: PlanTurnSideEffect[] = [];

  // Use unified streaming turn when planning is needed and tools are available
  // This replaces the two-phase plan+stream approach with a single streaming call
  const hasTools = Array.isArray(composition.tools) && composition.tools.length > 0;
  if (composition.shouldPlan && hasTools) {
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
      startBuffered,
      userContent,
      combinedSystem: composition.system,
      systemStable: composition.systemStable,
      systemDynamic: composition.systemDynamic,
      pipeline,
      onPlanResult: hooks?.onPlanResult,
      onPlanSideEffects: hooks?.onPlanSideEffects,
      shouldShortCircuit,
    });

    // Convert streaming result to plan result format for compatibility
    planResult = {
      finalSystem: streamingResult.finalSystem,
      usedTutorContentTool: streamingResult.usedTutorContentTool,
      hasSearchResults: streamingResult.hasSearchResults,
      learnerModel: streamingResult.learnerModel,
      planUpdates: streamingResult.planUpdates,
      updatedPlan: streamingResult.updatedPlan,
      learnerModelDebug: streamingResult.learnerModelDebug,
    };
    planSideEffects = streamingResult.sideEffects;

    if (streamingResult.shortCircuited) {
      return { composition, plan: planResult, shortCircuited: true };
    }

    return { composition, plan: planResult, shortCircuited: false };
  }

  // Legacy path: use old plan+stream when planning without tools, or no planning needed
  if (composition.shouldPlan) {
    const planOutput = await plan({
      chat,
      chatId,
      assistantMessage,
      userContent,
      combinedSystem: composition.system,
      systemStable: composition.systemStable,
      systemDynamic: composition.systemDynamic,
      baseMessages: composition.messages,
      toolDefinition: composition.tools,
      controller,
      turn: turnContext,
      settings: composition.settings,
    });
    planResult = planOutput.result;
    planSideEffects = planOutput.sideEffects;
    hooks?.onPlanResult?.(planResult);
    hooks?.onPlanSideEffects?.(planSideEffects);

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
    systemStable: composition.systemStable,
    systemDynamic: composition.systemDynamic,
  });

  return { composition, plan: planResult, shortCircuited: false };
};
