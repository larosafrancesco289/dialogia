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
import { t } from '@/lib/i18n';

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
      ctx.setNotice(t(next ? 'slash.searchOn' : 'slash.searchOff'), 'success');
    } else {
      const prev = !!ctx.nextOverrides.search?.enabled;
      const next = enabled == null ? !prev : enabled;
      ctx.setUI({ overrides: { search: { enabled: next } } });
      ctx.setNotice(t(next ? 'slash.searchOnNext' : 'slash.searchOffNext'), 'success');
    }
    return true;
  }

  if (command === 'reasoning' || command === 'think') {
    const allowed = Object.values(ReasoningEffortEnum) as Effort[];
    const effort = arg.toLowerCase() as Effort;
    if (!allowed.includes(effort)) return false;
    ctx.accept();
    if (!isReasoningSupported(currentModel)) {
      ctx.setNotice(t('slash.noThinking'), 'info');
      return true;
    }
    const selectable = getSelectableReasoningEfforts(currentModel);
    if (selectable.length > 0 && !selectable.includes(effort)) {
      ctx.setNotice(t('slash.effortUnavailable', { level: t(`effort.${effort}`) }), 'info');
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
    ctx.setNotice(t('slash.effortSet', { level: t(`effort.${effort}`) }), 'success');
    return true;
  }

  if (command === 'model' || command === 'm') {
    const id = arg.trim();
    if (!id) return false;
    const byId = findModelById(ctx.models, id);
    const byName = ctx.models.find((model) => model.name?.toLowerCase() === id.toLowerCase());
    const chosen = byId || byName;
    if (!chosen) {
      // Handled, not sent, and left in the composer so a typo can be fixed.
      ctx.setNotice(t('slash.noSuchModel', { name: id }));
      return true;
    }
    ctx.accept();
    if (applyToChat) {
      await ctx.updateChatSettings({ modelId: chosen.id });
    } else {
      ctx.setUI({ overrides: { modelId: chosen.id } });
    }
    ctx.setNotice(t('slash.modelSet', { name: chosen.name || chosen.id }), 'success');
    return true;
  }

  if (command === 'help') {
    ctx.accept();
    ctx.setNotice(t('slash.helpText'), 'info');
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

export type ComposerSubmitResult = 'sent' | 'command' | 'noop' | 'blocked';

type ComposerSubmitOptions = {
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
  /**
   * Whether the message could go out now. Asked before a chat is opened or the
   * draft cleared: a send that stops at a missing key would otherwise leave an
   * empty chat and take the text with it.
   */
  canSend?: () => boolean;
  defaultModelId?: string;
};

export async function submitComposer(
  options: ComposerSubmitOptions,
  { text, attachments, metadata, onBeforeSend, onAfterSend, onCommandHandled }: SubmitArgs,
): Promise<ComposerSubmitResult> {
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
  if (options.canSend && !options.canSend()) return 'blocked';
  if (!options.chat) {
    await options.newChat();
  }
  onBeforeSend?.();
  await options.sendMessage(trimmed, { attachments, metadata });
  onAfterSend?.();
  return 'sent';
}

export function useComposerShortcuts(options: ComposerSubmitOptions) {
  const handleSubmit = useCallback((args: SubmitArgs) => submitComposer(options, args), [options]);

  return { handleSubmit };
}
