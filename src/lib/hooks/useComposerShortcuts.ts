import type { NoticeTone } from '@/lib/contracts/ui';
import { useCallback } from 'react';
import type {
  Chat,
  ChatSettingsPatch,
  DraftAttachment,
  Message,
  ModelDescriptor,
} from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import {
  findModelById,
  getSelectableReasoningEfforts,
  isReasoningSupported,
  resolveDynamicModelId,
} from '@/lib/models';
import type { UiNextOverrides } from '@/lib/contracts/ui';
import type { UIState } from '@/lib/store/types';
import type { ReasoningEffort } from '@/lib/types';
import { ReasoningEffortEnum } from '@/lib/types';

type Effort = ReasoningEffort;

type NextOverrides = UiNextOverrides;

type SlashCommandContext = {
  chat: Chat | undefined;
  models: ModelDescriptor[];
  nextOverrides: NextOverrides;
  updateChatSettings: (partial: ChatSettingsPatch) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
  setNotice: (notice?: string, tone?: NoticeTone) => void;
  defaultModelId: string;
  /**
   * The input is a command: called once, before anything is awaited, so the
   * composer clears at once and text typed while a setting saves is kept.
   */
  accept: () => void;
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
    ctx.accept();
    if (applyToChat && ctx.chat) {
      const next = enabled == null ? !ctx.chat.settings.features.search.enabled : enabled;
      await ctx.updateChatSettings({ features: { search: { enabled: next } } });
      ctx.setNotice(`Web search is ${next ? 'on' : 'off'} in this chat.`, 'info');
    } else {
      const prev = !!ctx.nextOverrides.search?.enabled;
      const next = enabled == null ? !prev : enabled;
      ctx.setUI({ overrides: { search: { enabled: next } } });
      ctx.setNotice(`Web search will be ${next ? 'on' : 'off'} in the next chat.`, 'info');
    }
    return true;
  }

  if (command === 'reasoning' || command === 'think') {
    const allowed = Object.values(ReasoningEffortEnum) as Effort[];
    const effort = arg.toLowerCase() as Effort;
    if (!allowed.includes(effort)) return false;
    ctx.accept();
    if (!isReasoningSupported(currentModel)) {
      ctx.setNotice('This model does not reason, so it has no effort to set.');
      return true;
    }
    const selectable = getSelectableReasoningEfforts(currentModel);
    if (selectable.length > 0 && !selectable.includes(effort)) {
      ctx.setNotice(`This model does not offer ${effort} effort.`);
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({
        generation: {
          reasoningEffort: effort,
          ...(effort === 'none' ? { reasoningTokens: undefined } : {}),
        },
      });
    } else {
      ctx.setUI({
        overrides: {
          reasoning: {
            effort,
            ...(effort === 'none' ? { tokens: undefined } : {}),
          },
        },
      });
    }
    ctx.setNotice(`Reasoning effort set to ${effort}.`, 'info');
    return true;
  }

  if (command === 'model' || command === 'm') {
    const id = arg.trim();
    if (!id) return false;
    ctx.accept();
    const byId = findModelById(ctx.models, id);
    const byName = ctx.models.find((model) => model.name?.toLowerCase() === id.toLowerCase());
    const chosen = byId || byName;
    if (!chosen) {
      ctx.setNotice(`No model is called ${id}.`);
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({ modelId: chosen.id });
    } else {
      ctx.setUI({ overrides: { modelId: chosen.id } });
    }
    ctx.setNotice(`Now answering with ${chosen.name || chosen.id}.`, 'info');
    return true;
  }

  if (command === 'help') {
    ctx.accept();
    ctx.setNotice(
      'Type /model and a name to change model, /search on or off for web search, and /reasoning with a level such as low or high.',
      'info',
    );
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
  setNotice: (notice?: string, tone?: NoticeTone) => void;
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
      // An attachment on its own is a message; the model is asked about it.
      if (!trimmed && attachments.length === 0) return 'noop';
      const commandHandled = await runSlashCommand(trimmed, {
        chat: options.chat,
        models: options.models,
        nextOverrides: options.nextOverrides,
        updateChatSettings: options.updateChatSettings,
        setUI: options.setUI,
        setNotice: options.setNotice,
        accept: () => onCommandHandled?.(),
        defaultModelId: resolveDynamicModelId(
          options.defaultModelId || DEFAULT_MODEL_ID,
          options.models,
        ),
      });
      if (commandHandled) return 'command';
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
