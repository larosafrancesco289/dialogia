import type { ComponentType } from 'react';
import {
  ChatBubbleLeftRightIcon,
  BoltIcon,
  CodeBracketIcon,
  PhotoIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';

type CuratedModel = {
  id: string;
  name: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
};

// Ids starting with '~' are dynamic aliases resolved against the live model
// list (see src/lib/models/dynamicDefaults.ts), so defaults track releases.
export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: '~openai/gpt-latest',
  name: 'GPT Latest',
  description: 'Newest flagship GPT — frontier default for reasoning, writing, tools, and polish',
  Icon: ChatBubbleLeftRightIcon,
};

export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: '~anthropic/frontier',
  name: 'Claude Frontier',
  description: 'Most capable Anthropic model — premium tutor for high-stakes explanations',
  Icon: BoltIcon,
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  DEFAULT_TUTOR_MODEL,
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    description: 'Best multimodal research pick with a massive context window',
    Icon: RocketLaunchIcon,
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'Top open-weight option for coding, agents, and value',
    Icon: CodeBracketIcon,
  },
  {
    id: 'openai/gpt-5.4-image-2',
    name: 'GPT-5.4 Image 2',
    description: 'Best creative option for image-capable multimodal work',
    Icon: PhotoIcon,
  },
  {
    id: 'x-ai/grok-4.3',
    name: 'Grok 4.3',
    description: 'Fast long-context reasoning for agentic and bulk tasks',
    Icon: RocketLaunchIcon,
  },
];

export type { CuratedModel };
