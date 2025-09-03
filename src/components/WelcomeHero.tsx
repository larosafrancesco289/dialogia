'use client';
import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import Composer from '@/components/Composer';
import { findModelById } from '@/lib/models';
import { DEFAULT_MODEL_ID } from '@/lib/constants';

export default function WelcomeHero() {
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  const ui = useChatStore((s) => s.ui);
  const models = useChatStore((s) => s.models);

  const quickStart = useCallback(
    async (prompt: string) => {
      await newChat();
      await send(prompt);
    },
    [newChat, send],
  );

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      {/* Centered hero block */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-3xl px-6 mx-auto text-center space-y-4">
          <div className="text-3xl sm:text-4xl font-semibold">Welcome to Dialogia</div>
          <p className="text-sm text-muted-foreground">
            Ask anything. Your prompts stay local, and you control the model.
          </p>
          {/* Model indicator and quick suggestions */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Using{' '}
              {findModelById(models, ui.nextModel || DEFAULT_MODEL_ID)?.name ||
                ui.nextModel ||
                DEFAULT_MODEL_ID}
            </div>
            <div className="hidden sm:block text-xs text-muted-foreground">•</div>
            <div className="flex gap-2 flex-wrap">
              {['Summarize a link', 'Write an email', 'Explain code', 'Create a study plan'].map(
                (s) => (
                  <button
                    key={s}
                    className="badge"
                    onClick={() => quickStart(s + '…')}
                    title="Start with this suggestion"
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
          {/* Centered composer under the hero heading, hero variant */}
          <div className="pt-2">
            <Composer variant="hero" />
          </div>
        </div>
      </div>
    </div>
  );
}
