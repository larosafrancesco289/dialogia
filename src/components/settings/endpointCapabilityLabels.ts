import type { EndpointCapabilities } from '@/lib/transport/endpoints';

export const CAPABILITY_LABELS: Array<{
  key: keyof EndpointCapabilities;
  label: string;
  hint: string;
}> = [
  { key: 'tools', label: 'Tools', hint: 'Let the model use tools, such as search and memory.' },
  { key: 'vision', label: 'Images', hint: 'Send images.' },
  { key: 'reasoning', label: 'Thinking effort', hint: 'Send a thinking level.' },
  { key: 'streamUsage', label: 'Reply costs', hint: 'Report what each reply cost.' },
  {
    key: 'parallelToolCalls',
    label: 'Several tools at once',
    hint: 'Let the model use more than one tool in a step.',
  },
  { key: 'promptCaching', label: 'Prompt caching', hint: 'Reuse long prompts to save cost.' },
];
