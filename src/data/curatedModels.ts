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

export const DEFAULT_CHAT_MODEL: CuratedModel = {
  id: 'moonshotai/kimi-k2.5',
  name: 'Kimi K2.5',
  description: 'Great for general chat and quick conversations',
  Icon: ChatBubbleLeftRightIcon,
};

export const DEFAULT_TUTOR_MODEL: CuratedModel = {
  id: 'google/gemini-3-flash-preview',
  name: 'Gemini 3 Flash',
  description: 'Fast multimodal reasoning and knowledge tasks',
  Icon: BoltIcon,
};

export const DEFAULT_MODEL_ID = DEFAULT_CHAT_MODEL.id;
export const DEFAULT_MODEL_NAME = DEFAULT_CHAT_MODEL.name;
export const DEFAULT_TUTOR_MODEL_ID = DEFAULT_TUTOR_MODEL.id;

export const CURATED_MODELS: CuratedModel[] = [
  DEFAULT_CHAT_MODEL,
  DEFAULT_TUTOR_MODEL,
  {
    id: 'minimax/minimax-m2.1',
    name: 'Minimax M2.1',
    description: 'Strong coding and reasoning capabilities',
    Icon: CodeBracketIcon,
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: 'State-of-the-art image generation',
    Icon: PhotoIcon,
  },
  {
    id: 'x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    description: 'Very fast with huge context, great for bulk processing',
    Icon: RocketLaunchIcon,
  },
];

export type { CuratedModel };
