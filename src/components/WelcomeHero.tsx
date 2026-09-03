import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { Composer } from '@/components/chat/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { readNextOverrides } from '@/lib/ui/next';
import styles from './WelcomeHero.module.css';

export function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  const setUI = useChatStore((s) => s.setUI);
  const ui = useChatStore((s) => s.ui);
  const experimentalTutor = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!ui.tutor?.forceMode;
  const nextTutorMode = !!readNextOverrides(ui).tutorMode;
  const tutorActive = experimentalTutor && (forceTutorMode || nextTutorMode);

  const quickStartPhrases = tutorActive
    ? ['Quiz me on...', 'Help me understand...', 'Walk me through...']
    : ['Help me think through...', "I'm curious about...", 'Explain to me...'];

  const fillComposer = useCallback(
    (text: string) => {
      // Replace trailing "..." with a space so user can continue typing
      const draft = text.replace(/\.{3}$/, ' ');
      setUI({ composerDraft: draft });
    },
    [setUI],
  );

  // Headlines that feel like chapter openings
  const heroTitle = tutorActive ? (
    <>
      Ready for a <span className={styles.headlineEmphasis}>tutoring</span> session
    </>
  ) : (
    <>
      Begin a new <span className={styles.headlineEmphasis}>dialogue</span>
    </>
  );
  return (
    <div className={styles.hero}>
      <div className={`${styles.heroGradient} hero-gradient`} />

      {/* Desktop: Asymmetric two-column layout */}
      <div className={styles.heroDesktop}>
        {/* Left column: Title and marginalia */}
        <div className={styles.heroLeft}>
          <div className={styles.titleBlock}>
            <div className={styles.decorativeRule} aria-hidden="true" />
            <h1 className={styles.headline}>{heroTitle}</h1>
          </div>

          {/* Quick starts as marginalia */}
          <nav className={styles.marginalia} aria-label="Quick start suggestions">
            <span className={styles.marginaliaLabel}>Quick starts</span>
            <div className={styles.marginaliaList}>
              {quickStartPhrases.map((phrase, idx) => (
                <button
                  key={phrase}
                  className={styles.marginaliaItem}
                  onClick={() => fillComposer(phrase)}
                  title={`Start with: ${phrase}`}
                >
                  <span className={styles.marginaliaNumber}>{idx + 1}.</span>
                  <span>{phrase}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Right column: The writing surface */}
        <div className={styles.heroRight}>
          <div className={styles.manuscriptSurface}>
            <div className={styles.manuscriptRule} aria-hidden="true" />
            <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
          </div>
        </div>
      </div>

      {/* Mobile: Vertical centered layout */}
      <div className={styles.heroMobile}>
        <div className={styles.heroMobileContent}>
          <div className={styles.heroMobileTitleBlock}>
            <h1 className={styles.heroMobileHeadline}>{heroTitle}</h1>
          </div>

          <div className={styles.heroMobileQuickStarts}>
            {quickStartPhrases.map((phrase) => (
              <button
                key={phrase}
                className={styles.heroMobileChip}
                onClick={() => fillComposer(phrase)}
                title={`Start with: ${phrase}`}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile sticky composer */}
      <div className={styles.heroMobileComposer}>
        <div className="sm:hidden">
          <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />
        </div>
      </div>
    </div>
  );
}
