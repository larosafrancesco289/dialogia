'use client';
import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import Composer from '@/components/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
// No model label here; keep imports lean

export default function WelcomeHero({
  keyboardMetrics,
}: {
  keyboardMetrics: KeyboardMetrics;
}) {
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  // We intentionally hide the model label on the hero

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

      {/* Desktop / tablet: centered hero with inline composer */}
      <div className="hidden sm:flex relative z-10 flex-1 items-center justify-center">
        <div className="w-full max-w-3xl px-6 mx-auto text-center space-y-4">
          <div className="text-2xl sm:text-4xl font-semibold">Welcome to Dialogia</div>
          <p className="text-sm text-muted-foreground">
            Ask anything. Your chats stay local, and you control the model.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {['Email', 'Explain code', 'Study plan'].map((s) => (
                <button
                  key={s}
                  className="badge"
                  onClick={() => quickStart(s + '…')}
                  title="Start with this suggestion"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
          </div>
        </div>
      </div>

      {/* Mobile: center content vertically, sticky composer at bottom */}
      <div className="sm:hidden relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl px-4 mx-auto text-center space-y-3">
          <div className="text-2xl font-semibold">Welcome to Dialogia</div>
          <p className="text-sm text-muted-foreground">
            Ask anything. Your chats stay local, and you control the model.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {['Email', 'Explain code', 'Study plan'].map((s) => (
              <button
                key={s}
                className="badge"
                onClick={() => quickStart(s + '…')}
                title="Start with this suggestion"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sm:hidden">
        <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />
      </div>
    </div>
  );
}
