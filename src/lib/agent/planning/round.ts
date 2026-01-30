import { getChatCompletion, type PipelineClient } from '@/lib/agent/pipelineClient';
import { captureRequestDebug } from '@/lib/agent/debug';
import { detectPlanningToolCalls } from '@/lib/agent/tools/router';
import { shouldIncludeUsage } from '@/lib/api/normalizers';
import { isToolCallingSupported } from '@/lib/models';
import { isReasoningRequested } from '@/lib/settings/generation';
import type {
  AssistantModelMessage,
  ModelMessage,
  PlanTurnOptions,
  ToolCall,
  ToolDefinition,
} from '@/lib/agent/types';
import type { Message } from '@/lib/types';

export type PlanningRoundResult = {
  message: Partial<AssistantModelMessage> & { reasoning_details?: unknown };
  toolCalls: ToolCall[];
  toolsForPlanning?: ToolDefinition[];
};

export async function runPlanningRound(args: {
  convo: ModelMessage[];
  assistantMessage: Message;
  toolDefinition?: ToolDefinition[];
  controller: AbortController;
  turn: PlanTurnOptions['turn'];
  settings: PlanTurnOptions['settings'];
  pipeline?: PipelineClient;
}): Promise<PlanningRoundResult> {
  const { convo, assistantMessage, toolDefinition, controller, turn, settings } = args;
  const { auth } = turn;
  const generation = settings.generation;
  const supportsTools = isToolCallingSupported(settings.modelMeta);
  const toolsForPlanning =
    supportsTools && Array.isArray(toolDefinition) && toolDefinition.length > 0
      ? toolDefinition
      : undefined;

  captureRequestDebug({
    turn,
    messageId: assistantMessage.id,
    modelId: settings.modelId,
    messages: convo,
    stream: false,
    includeUsage: shouldIncludeUsage(false),
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    tools: toolsForPlanning,
    toolChoice: toolsForPlanning ? 'auto' : undefined,
    providerSort: generation.providerSort,
  });

  const disableReasoning = settings.caps.canReason && !isReasoningRequested(generation);

  const resp = await getChatCompletion(args.pipeline)({
    auth,
    model: settings.modelId,
    messages: convo,
    temperature: generation.temperature,
    topP: generation.topP,
    maxTokens: generation.maxTokens,
    reasoningEffort: generation.reasoningEffort,
    reasoningTokens: generation.reasoningTokens,
    disableReasoning,
    providerSort: generation.providerSort,
    tools: toolsForPlanning,
    toolChoice: toolsForPlanning ? ('auto' as const) : undefined,
    signal: controller.signal,
    plugins: undefined,
  });

  const choice = resp?.choices?.[0];
  const message = (choice?.message || {}) as Partial<AssistantModelMessage> & {
    reasoning_details?: unknown;
  };
  const toolCalls: ToolCall[] = detectPlanningToolCalls({
    message,
    toolDefinition,
  });

  return { message, toolCalls, toolsForPlanning };
}
