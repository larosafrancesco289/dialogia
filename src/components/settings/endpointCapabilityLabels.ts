import type { MessageKey } from '@/lib/i18n';
import type { EndpointCapabilities } from '@/lib/transport/endpoints';

export const CAPABILITY_LABELS: Array<{
  key: keyof EndpointCapabilities;
  label: MessageKey;
  hint: MessageKey;
}> = [
  { key: 'tools', label: 'capability.tools', hint: 'capability.toolsHint' },
  { key: 'vision', label: 'capability.vision', hint: 'capability.visionHint' },
  { key: 'reasoning', label: 'effort.title', hint: 'capability.reasoningHint' },
  { key: 'streamUsage', label: 'capability.streamUsage', hint: 'capability.streamUsageHint' },
  {
    key: 'parallelToolCalls',
    label: 'capability.parallelToolCalls',
    hint: 'capability.parallelToolCallsHint',
  },
  {
    key: 'promptCaching',
    label: 'capability.promptCaching',
    hint: 'capability.promptCachingHint',
  },
];
