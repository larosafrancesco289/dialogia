'use client';
import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import Composer from '@/components/Composer';
// No model label here; keep imports lean

export default function WelcomeHero() {
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
      {/* Centered hero block */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-3xl px-6 mx-auto text-center space-y-4">
          <div className="text-3xl sm:text-4xl font-semibold">Welcome to Dialogia</div>
          <p className="text-sm text-muted-foreground">
            Ask anything. Your chats stay local, and you control the model.
          </p>
          {/* Quick suggestions (no model label for brevity) */}
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
          {/* Centered composer under the hero heading, hero variant */}
          <div className="pt-2">
            <Composer variant="hero" />
          </div>
        </div>
      </div>
    </div>
  );
}
