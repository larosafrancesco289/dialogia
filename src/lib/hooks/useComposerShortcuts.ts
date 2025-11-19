import { useCallback } from 'react';
import type { Attachment, Chat, Message, ORModel } from '@/lib/types';
import type { ChatSettings } from '@/lib/types';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { findModelById, isReasoningSupported } from '@/lib/models';
import type { UIState, UINextOverrides } from '@/lib/store/types';

type Effort = 'none' | 'low' | 'medium' | 'high';

type NextOverrides = UINextOverrides;

type SlashCommandContext = {
  chat: Chat | undefined;
  models: ORModel[];
  nextOverrides: NextOverrides;
  updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
};

async function runSlashCommand(input: string, ctx: SlashCommandContext): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return false;
  const parts = trimmed.slice(1).split(/\s+/);
  const command = (parts.shift() || '').toLowerCase();
  const arg = parts.join(' ').trim();
  const applyToChat = !!ctx.chat;
  const currentModelId =
    ctx.chat?.settings.model || ctx.nextOverrides.model || DEFAULT_MODEL_ID;
  const currentModel = findModelById(ctx.models, currentModelId);

  const setNotice = (msg: string) => ctx.setUI({ notice: msg });

  if (command === 'search' || command === 'web') {
    let enabled: boolean | undefined;
    if (arg === 'on') enabled = true;
    else if (arg === 'off') enabled = false;
    else if (arg === 'toggle' || arg === '') enabled = undefined;
    else return false;
    if (applyToChat && ctx.chat) {
      const next = enabled == null ? !ctx.chat.settings.search_enabled : enabled;
      await ctx.updateChatSettings({ search_enabled: next });
      setNotice(`Web search: ${next ? 'On' : 'Off'}`);
    } else {
      const prev = !!ctx.nextOverrides.search?.enabled;
      const next = enabled == null ? !prev : enabled;
      ctx.setUI({ next: { search: { enabled: next } } });
      setNotice(`Web search (next): ${next ? 'On' : 'Off'}`);
    }
    return true;
  }

  if (command === 'reasoning' || command === 'think') {
    const allowed: Effort[] = ['none', 'low', 'medium', 'high'];
    const effort = arg.toLowerCase() as Effort;
    if (!allowed.includes(effort)) return false;
    if (!isReasoningSupported(currentModel)) {
      setNotice('Reasoning not supported by current model');
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({ reasoning_effort: effort });
    } else {
      ctx.setUI({ next: { reasoning: { effort } } });
    }
    setNotice(`Reasoning effort: ${effort}`);
    return true;
  }

  if (command === 'model' || command === 'm') {
    const id = arg.trim();
    if (!id) return false;
    const byId = findModelById(ctx.models, id);
    const byName = ctx.models.find((model) => model.name?.toLowerCase() === id.toLowerCase());
    const chosen = byId || byName;
    if (!chosen) {
      setNotice(`Unknown model: ${id}`);
      return true;
    }
    if (applyToChat) {
      await ctx.updateChatSettings({ model: chosen.id });
    } else {
      ctx.setUI({ next: { model: chosen.id } });
    }
    setNotice(`Model set to ${chosen.name || chosen.id}`);
    return true;
  }

  if (command === 'help') {
    setNotice('Slash: /model <id>, /search on|off|toggle, /reasoning none|low|medium|high');
    return true;
  }

  return false;
}

type SubmitArgs = {
  text: string;
  attachments: Attachment[];
  metadata?: Message['metadata'];
  onBeforeSend?: () => void;
  onAfterSend?: () => void;
  onCommandHandled?: () => void;
};

export type ComposerSubmitResult = 'sent' | 'command' | 'noop';

export function useComposerShortcuts(options: {
  chat: Chat | undefined;
  models: ORModel[];
  nextOverrides: NextOverrides;
  updateChatSettings: (partial: Partial<ChatSettings>) => Promise<void>;
  setUI: (partial: Partial<UIState>) => void;
  newChat: () => Promise<void>;
  sendMessage: (text: string, opts: { attachments?: Attachment[]; metadata?: Message['metadata'] }) => Promise<void>;
}) {
  const handleSubmit = useCallback(
    async ({ text, attachments, metadata, onBeforeSend, onAfterSend, onCommandHandled }: SubmitArgs): Promise<ComposerSubmitResult> => {
      const trimmed = text.trim();
      if (!trimmed) return 'noop';
      const commandHandled = await runSlashCommand(trimmed, {
        chat: options.chat,
        models: options.models,
        nextOverrides: options.nextOverrides,
        updateChatSettings: options.updateChatSettings,
        setUI: options.setUI,
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
    [
      options.chat,
      options.models,
      options.nextOverrides,
      options.updateChatSettings,
      options.setUI,
      options.newChat,
      options.sendMessage,
    ],
  );

  return { handleSubmit };
}
