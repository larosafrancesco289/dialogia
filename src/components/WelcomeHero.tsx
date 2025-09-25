'use client';
import { useCallback, useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import Composer from '@/components/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { normalizeTutorMemory } from '@/lib/agent/tutorMemory';

export default function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  const ui = useChatStore((s) => s.ui);
  const experimentalTutor = !!ui.experimentalTutor;
  const forceTutorMode = !!ui.forceTutorMode;
  const nextTutorMode = !!ui.nextTutorMode;
  const tutorActive = experimentalTutor && (forceTutorMode || nextTutorMode);
  const tutorMemory = useMemo(
    () => normalizeTutorMemory(ui.tutorGlobalMemory),
    [ui.tutorGlobalMemory],
  );
  const quickStartPhrases = tutorActive
    ? ['Review my algebra notes', 'Quiz me on world history', 'Explain photosynthesis']
    : ['Email', 'Explain code', 'Study plan'];

  const quickStart = useCallback(
    async (prompt: string) => {
      await newChat();
      await send(prompt);
    },
    [newChat, send],
  );

  const heroTitle = tutorActive ? 'Ready for a tutoring session' : 'Welcome to Dialogia';
  const heroSubtitle = tutorActive
    ? 'Share your goals or paste material, and your tutor will respond after your first message.'
    : 'Ask anything. Your chats stay local, and you control the model.';

  const renderMemory = useCallback(() => {
    if (!tutorActive || !tutorMemory) return null;
    const lines = tutorMemory.split(/\r?\n/).slice(0, 12);
    return (
      <div className="card bg-card/70 border border-border/60 text-left text-sm leading-relaxed space-y-2">
        <div className="px-4 pt-4 text-xs font-semibold text-muted-foreground tracking-wide uppercase">
          Tutor memory
        </div>
        <pre className="px-4 pb-4 whitespace-pre-wrap font-sans text-xs text-muted-foreground/90">
          {lines.join('\n')}
        </pre>
      </div>
    );
  }, [tutorActive, tutorMemory]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute inset-0 hero-gradient pointer-events-none" />

      {/* Desktop / tablet: centered hero with inline composer */}
      <div className="hidden sm:flex relative z-10 flex-1 items-center justify-center">
        <div className="w-full max-w-3xl px-6 mx-auto text-center space-y-4">
          <div className="text-2xl sm:text-4xl font-semibold">{heroTitle}</div>
          <p className="text-sm text-muted-foreground">{heroSubtitle}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {quickStartPhrases.map((s) => (
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
          {renderMemory()}
          <div className="pt-2">
            <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
          </div>
        </div>
      </div>

      {/* Mobile: center content vertically, sticky composer at bottom */}
      <div className="sm:hidden relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl px-4 mx-auto text-center space-y-3">
          <div className="text-2xl font-semibold">{heroTitle}</div>
          <p className="text-sm text-muted-foreground">{heroSubtitle}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {quickStartPhrases.map((s) => (
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
          {tutorActive && <div className="pt-1">{renderMemory()}</div>}
        </div>
      </div>
      <div className="sm:hidden">
        <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />
      </div>
    </div>
  );
}
