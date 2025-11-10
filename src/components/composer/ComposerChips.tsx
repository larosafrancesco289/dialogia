'use client';
import {
  EyeIcon,
  PhotoIcon,
  MicrophoneIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { ORModel } from '@/lib/types';
import type { Effort } from '@/components/composer/ComposerMobileMenu';
import { findModelById } from '@/lib/models';

type ComposerChipsProps = {
  tutorEnabled: boolean;
  modelId: string;
  models: ORModel[];
  openSettings: () => void;
  currentNode?: { name: string } | null;
  canVision: boolean;
  canImageOut: boolean;
  canAudio: boolean;
  searchProvider: 'brave' | 'openrouter';
  searchEnabled: boolean;
  toggleSearch: () => void;
  supportsReasoning: boolean;
  currentEffort?: Effort;
};

export function ComposerChips({
  tutorEnabled,
  modelId,
  models,
  openSettings,
  currentNode,
  canVision,
  canImageOut,
  canAudio,
  searchProvider,
  searchEnabled,
  toggleSearch,
  supportsReasoning,
  currentEffort,
}: ComposerChipsProps) {
  const modelName = tutorEnabled ? 'Tutor' : findModelById(models, modelId)?.name || modelId;
  const effortLabel =
    currentEffort && currentEffort !== 'none'
      ? currentEffort === 'high'
        ? 'H'
        : currentEffort === 'medium'
          ? 'M'
          : 'L'
      : null;

  return (
    <div className="mt-2 hidden sm:flex items-center gap-2 flex-wrap text-xs">
      <button className="badge" title="Change model (opens Settings)" onClick={openSettings}>
        {modelName}
      </button>
      {currentNode && (
        <span
          className="badge flex items-center gap-1"
          style={{
            background: 'color-mix(in oklab, var(--color-accent-2) 15%, transparent)',
            borderColor: 'color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))',
            color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)',
          }}
          title={`Currently learning: ${currentNode.name}`}
          aria-label="Current learning focus"
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          {currentNode.name}
        </span>
      )}
      {canVision && (
        <span className="badge flex items-center gap-1" title="Vision input supported">
          <EyeIcon className="h-3.5 w-3.5" />
        </span>
      )}
      {canImageOut && (
        <span className="badge flex items-center gap-1" title="Image generation supported">
          <PhotoIcon className="h-3.5 w-3.5" />
        </span>
      )}
      {canAudio && (
        <span className="badge flex items-center gap-1" title="Audio input supported (mp3/wav)">
          <MicrophoneIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <button
        className="badge flex items-center gap-1"
        title={`Toggle ${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} web search for next message`}
        onClick={toggleSearch}
        aria-pressed={searchEnabled}
      >
        <MagnifyingGlassIcon className="h-3.5 w-3.5" />
        {(searchProvider === 'openrouter' ? 'OR' : 'Brave') + ' ' + (searchEnabled ? 'On' : 'Off')}
      </button>
      {!tutorEnabled && supportsReasoning && effortLabel && (
        <span className="badge flex items-center gap-1" title={`Reasoning effort: ${currentEffort}`}>
          <LightBulbIcon className="h-3.5 w-3.5" /> {effortLabel}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        Press Enter to send · Shift+Enter for newline
      </span>
    </div>
  );
}
