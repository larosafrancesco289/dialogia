import { useCallback } from 'react';
import type {
  Chat,
  ChatSettingsPatch,
  DraftAttachment,
  Message,
  ModelDescriptor,
} from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { findModelById, isReasoningSupported } from '@/lib/models';
import type { UiNextOverrides } from '@/lib/contracts/ui';
import type { UIState } from '@/lib/store/types';

type Effort = 'none' | 'low' | 'medium' | 'high';

type NextOverrides = UiNextOverrides;

type SlashCommandContext = {
  chat: Chat | undefined;
  models: ModelDescriptor[];
  nextOverrides: NextOverrides;
  updateChatSettings: (partial: ChatSettingsPatch) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
  setNotice: (notice?: string) => void;
  defaultModelId: string;
};

async function runSlashCommand(input: string, ctx: SlashCommandContext): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return false;
  const parts = trimmed.slice(1).split(/\s+/);
  const command = (parts.shift() || '').toLowerCase();
  const arg = parts.join(' ').trim();
  const applyToChat = !!ctx.chat;
  const currentModelId =
    ctx.chat?.settings.modelId || ctx.nextOverrides.modelId || ctx.defaultModelId;
  const currentModel = findModelById(ctx.models, currentModelId);

  if (command === 'search' || command === 'web') {
    let enabled: boolean | undefined;
    if (arg === 'on') enabled = true;
    else if (arg === 'off') enabled = false;
    else if (arg === 'toggle' || arg === '') enabled = undefined;
    else return false;
    if (applyToChat && ctx.chat) {
      const next = enabled == null ? !ctx.chat.settings.features.search.enabled : enabled;
      await ctx.updateChatSettings({ features: { search: { enabled: next } } });
      ctx.setNotice(`Web search: ${next ? 'On' : 'Off'}`);
    } else {
      const prev = !!ctx.nextOverrides.search?.enabled;
      const next = enabled == null ? !prev : enabled;
      ctx.setUI({ overrides: { search: { enabled: next } } });
      ctx.setNotice(`Web search (next): ${next ? 'On' : 'Off'}`);
    }
    return true;
  }

  if (command === 'reasoning' || command === 'think') {
    const allowed: Effort[] = ['none', 'low', 'medium', 'high'];
    const effort = arg.toLowerCase() as Effort;
    if (!allowed.includes(effort)) return false;
    if (!isReasoningSupported(currentModel)) {
      ctx.setNotice('Reasoning not supported by current model');
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({ generation: { reasoningEffort: effort } });
    } else {
      ctx.setUI({ overrides: { reasoning: { effort } } });
    }
    ctx.setNotice(`Reasoning effort: ${effort}`);
    return true;
  }

  if (command === 'model' || command === 'm') {
    const id = arg.trim();
    if (!id) return false;
    const byId = findModelById(ctx.models, id);
    const byName = ctx.models.find((model) => model.name?.toLowerCase() === id.toLowerCase());
    const chosen = byId || byName;
    if (!chosen) {
      ctx.setNotice(`Unknown model: ${id}`);
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({ modelId: chosen.id });
    } else {
      ctx.setUI({ overrides: { modelId: chosen.id } });
    }
    ctx.setNotice(`Model set to ${chosen.name || chosen.id}`);
    return true;
  }

  if (command === 'help') {
    ctx.setNotice('Slash: /model <id>, /search on|off|toggle, /reasoning none|low|medium|high');
    return true;
  }

  return false;
}

type SubmitArgs = {
  text: string;
  attachments: DraftAttachment[];
  metadata?: Message['metadata'];
  onBeforeSend?: () => void;
  onAfterSend?: () => void;
  onCommandHandled?: () => void;
};

export type ComposerSubmitResult = 'sent' | 'command' | 'noop';

export function useComposerShortcuts(options: {
  chat: Chat | undefined;
  models: ModelDescriptor[];
  nextOverrides: NextOverrides;
  updateChatSettings: (partial: ChatSettingsPatch) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
  setNotice: (notice?: string) => void;
  newChat: () => Promise<void>;
  sendMessage: (
    text: string,
    opts: { attachments?: DraftAttachment[]; metadata?: Message['metadata'] },
  ) => Promise<void>;
  defaultModelId?: string;
}) {
  const handleSubmit = useCallback(
    async ({
      text,
      attachments,
      metadata,
      onBeforeSend,
      onAfterSend,
      onCommandHandled,
    }: SubmitArgs): Promise<ComposerSubmitResult> => {
      const trimmed = text.trim();
      if (!trimmed) return 'noop';
      const commandHandled = await runSlashCommand(trimmed, {
        chat: options.chat,
        models: options.models,
        nextOverrides: options.nextOverrides,
        updateChatSettings: options.updateChatSettings,
        setUI: options.setUI,
        setNotice: options.setNotice,
        defaultModelId: options.defaultModelId || DEFAULT_MODEL_ID,
      });
      if (commandHandled) {
        onCommandHandled?.();
        return 'command';
      }
      if (!options.chat) {
        await options.newChat();
      }
      onBeforeSend?.();
      await options.sendMessage(trimmed, { attachments, metadata });
      onAfterSend?.();
      return 'sent';
    },
    [options],
  );

  return { handleSubmit };
}
