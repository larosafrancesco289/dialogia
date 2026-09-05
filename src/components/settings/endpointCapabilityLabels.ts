import type { EndpointCapabilities } from '@/lib/transport/endpoints';

export const CAPABILITY_LABELS: Array<{
  key: keyof EndpointCapabilities;
  label: string;
  hint: string;
}> = [
  { key: 'tools', label: 'Tool calls', hint: 'Send tool definitions and accept tool calls.' },
  { key: 'vision', label: 'Images', hint: 'Accept image content blocks.' },
  { key: 'reasoning', label: 'Reasoning effort', hint: 'Send reasoning/effort parameters.' },
  { key: 'streamUsage', label: 'Usage in stream', hint: 'Ask for token usage on the last chunk.' },
  {
    key: 'parallelToolCalls',
    label: 'Parallel tool calls',
    hint: 'Allow more than one per round.',
  },
  { key: 'promptCaching', label: 'Prompt caching', hint: 'Send cache_control markers.' },
];
