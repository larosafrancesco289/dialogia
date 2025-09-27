'use client';
import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import Composer from '@/components/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';

export default function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  const ui = useChatStore((s) => s.ui);
  const experimentalTutor = !!ui.experimentalTutor;
  const forceTutorMode = !!ui.forceTutorMode;
  const nextTutorMode = !!ui.nextTutorMode;
  const tutorActive = experimentalTutor && (forceTutorMode || nextTutorMode);
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
          {tutorActive && <TutorGreetingCard />}
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
          {tutorActive && (
            <div className="pt-1">
              <TutorGreetingCard />
            </div>
          )}
        </div>
      </div>
      <div className="sm:hidden">
        <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />
      </div>
    </div>
  );
}

function TutorGreetingCard() {
  const {
    selectedChatId,
    prepareTutorWelcomeMessage,
    primeTutorWelcomePreview,
    welcomeState,
    previewState,
  } = useChatStore((s) => {
    const id = s.selectedChatId;
    return {
      selectedChatId: id,
      prepareTutorWelcomeMessage: s.prepareTutorWelcomeMessage,
      primeTutorWelcomePreview: s.primeTutorWelcomePreview,
      welcomeState: id ? s.ui.tutorWelcomeByChatId?.[id] : undefined,
      previewState: s.ui.tutorWelcomePreview,
    };
  });
  const [readyForReveal, setReadyForReveal] = useState(false);

  useEffect(() => {
    if (!selectedChatId) {
      try {
        primeTutorWelcomePreview();
      } catch {}
      return;
    }
    try {
      prepareTutorWelcomeMessage(selectedChatId);
    } catch {}
  }, [selectedChatId, prepareTutorWelcomeMessage, primeTutorWelcomePreview]);

  useEffect(() => {
    const current = selectedChatId ? (welcomeState ?? previewState) : previewState;
    if (current?.status === 'ready') {
      const tid = setTimeout(() => setReadyForReveal(true), 260);
      return () => clearTimeout(tid);
    }
    setReadyForReveal(false);
    return undefined;
  }, [welcomeState?.status, previewState?.status, selectedChatId]);

  const state = selectedChatId ? (welcomeState ?? previewState) : previewState;
  const status = state?.status ?? 'loading';
  const message = (state?.message || '').trim();
  const headerText =
    status === 'ready' && message
      ? 'Thanks for coming back.'
      : 'Give me a moment to gather our notes.';
  const showLoading = status !== 'ready' || !readyForReveal;
  const displayMessage =
    message || "Welcome back! I'm ready whenever you are. What should we dive into first?";

  return (
    <div
      className="tutor-greeting-card card bg-card/70 border border-border/60 text-left text-sm"
      aria-live="polite"
    >
      <div className="tutor-greeting-card__glow" aria-hidden />
      <div className="relative px-5 py-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground/90">
          <span className="tutor-greeting-card__icon" aria-hidden>
            <svg viewBox="0 0 24 24" className="tutor-greeting-card__wave-icon">
              <path d="M3 15c3-6 6-6 9 0 3 6 6 6 9 0" />
            </svg>
          </span>
          <span>{headerText}</span>
        </div>
        <div className="min-h-[72px]">
          {showLoading ? (
            <div className="tutor-greeting-loading">
              <div className="tutor-greeting-loading__spinner" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/90">
                  Gathering what you shared last time...
                </p>
                <p className="text-xs text-muted-foreground">
                  I'm lining up your goals, wins, and preferences so I can pick up where we left
                  off.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground/90 animate-fade-in">
              {displayMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
