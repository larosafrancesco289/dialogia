'use client';
import { useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import ReasoningEffortMenu from '@/components/ReasoningEffortMenu';
import { findModelById } from '@/lib/models';
import { DEFAULT_MODEL_ID } from '@/lib/constants';

export default function WelcomeHero() {
  const [query, setQuery] = useState('');
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  const ui = useChatStore((s) => s.ui);
  const setUI = useChatStore((s) => s.setUI);
  const models = useChatStore((s) => s.models);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const start = async () => {
    await newChat();
    const value = query.trim();
    if (value) await send(value);
    setQuery('');
  };

  // Auto-grow textarea height similar to the Composer
  useAutogrowTextarea(taRef, [query]);

  return (
    <div className="h-full flex items-center justify-center relative">
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      <div className="relative z-10 w-full max-w-3xl px-6 text-center space-y-6">
        <div className="text-3xl sm:text-4xl font-semibold">Welcome to Dialogia</div>
        <p className="text-sm text-muted-foreground">
          Ask anything. Your prompts stay local, and you control the model.
        </p>
        <div className="card p-2 flex items-center gap-2 glass-panel">
          <textarea
            ref={taRef}
            className="textarea flex-1 text-base"
            rows={1}
            placeholder="Ask anything"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                start();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              className="btn btn-outline self-center"
              onClick={() => setUI({ nextSearchWithBrave: !ui.nextSearchWithBrave })}
              title="Use web search (Brave) to augment the first message"
              aria-label="Toggle Brave Search"
              aria-pressed={!!ui.nextSearchWithBrave}
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </button>
            {/* Reasoning effort picker visible on hero when model supports it */}
            <ReasoningEffortMenu />
            <button
              className="btn btn-outline self-center"
              onClick={start}
              aria-label="Send"
              title="Send"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
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
                  onClick={() => setQuery(s + '…')}
                  title="Insert suggestion"
                >
                  {s}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Press Enter to start · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}
