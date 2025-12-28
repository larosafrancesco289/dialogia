import type { ModelTransport, ModelDescriptor } from '@/lib/types';
import { isReasoningSupported } from '@/lib/models';
import { NOTICE_DEEP_RESEARCH_REQUIRES_OPENROUTER } from '@/lib/store/notices';

export type DeepResearchPolicyInput = {
  searchEnabled: boolean;
  tutorEnabled: boolean;
  transport: ModelTransport;
  modelMeta?: ModelDescriptor;
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
      notice: NOTICE_DEEP_RESEARCH_REQUIRES_OPENROUTER,
    };
  }
  return { shouldRun: true };
}
