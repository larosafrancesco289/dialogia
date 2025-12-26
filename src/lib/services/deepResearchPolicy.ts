import type { ModelTransport, ORModel } from '@/lib/types';
import { isReasoningSupported } from '@/lib/models';

export type DeepResearchPolicyInput = {
  searchEnabled: boolean;
  tutorEnabled: boolean;
  transport: ModelTransport;
  modelMeta?: ORModel;
};

export type DeepResearchPolicyDecision = {
  shouldRun: boolean;
  notice?: string;
};

export function evaluateDeepResearchPolicy(
  input: DeepResearchPolicyInput,
): DeepResearchPolicyDecision {
  if (!input.searchEnabled || input.tutorEnabled) return { shouldRun: false };
  const supportsReasoning = input.modelMeta ? isReasoningSupported(input.modelMeta) : false;
  if (!supportsReasoning) return { shouldRun: false };
  if (input.transport !== 'openrouter') {
    return {
      shouldRun: false,
      notice: 'DeepResearch currently requires an OpenRouter model selection.',
    };
  }
  return { shouldRun: true };
}
