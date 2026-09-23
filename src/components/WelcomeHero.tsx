import { useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { Composer } from '@/components/chat/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { readNextOverrides } from '@/lib/ui/next';
import { LogoMark } from '@/components/ui/LogoMark';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import styles from './WelcomeHero.module.css';

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
];

/** "The seventh dialogue": each new chat is numbered like a chapter. */
function dialogueLabel(n: number) {
  return n <= ORDINALS.length ? `The ${ORDINALS[n - 1]} dialogue` : `Dialogue no. ${n}`;
}

export function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  const setUI = useChatStore((s) => s.setUI);
  const ui = useChatStore((s) => s.ui);
  // One layout at a time: two mounted composers fought over the shared
  // composer height and the phone's focus state.
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  // An empty selected chat is itself the dialogue being opened; with no chat
  // selected, the next one will be created on send.
  const dialogueNumber = useChatStore((s) => s.chats.length + (s.selectedChatId ? 0 : 1));
  const experimentalTutor = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!ui.tutor?.forceMode;
  const nextTutorMode = !!readNextOverrides(ui).tutorMode;
  const tutorActive = experimentalTutor && (forceTutorMode || nextTutorMode);

  const quickStartPhrases = tutorActive
    ? ['Quiz me on…', 'Help me understand…', 'Walk me through…']
    : ['Help me think through…', "I'm curious about…", 'Explain to me…'];

  const fillComposer = useCallback(
    (text: string) => {
      // Replace the trailing ellipsis with a space so the user can go on typing
      const draft = text.replace(/(\.{3}|…)$/, ' ');
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
      {/* Desktop: a centred opening page */}
      {!isMobile && (
        <div className={styles.heroDesktop}>
          <div className={styles.opening}>
            <LogoMark className={styles.mark} />
            <p className={styles.kicker}>{dialogueLabel(Math.max(1, dialogueNumber))}</p>
            <h1 className={styles.headline}>{heroTitle}</h1>
          </div>

          <div className={styles.composer}>
            <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
          </div>

          <nav className={styles.prompts} aria-label="Quick start suggestions">
            {quickStartPhrases.map((phrase) => (
              <button
                key={phrase}
                className={styles.prompt}
                onClick={() => fillComposer(phrase)}
                title={`Start with: ${phrase}`}
              >
                {phrase.replace(/\.{3}$/, '…')}
              </button>
            ))}
          </nav>

          <p className={styles.colophon}>Your keys never leave this browser</p>
        </div>
      )}

      {/* Phone: the opening centred above the composer at the foot */}
      {isMobile && (
        <>
          <div className={styles.heroMobile}>
            <div className={styles.heroMobileContent}>
              <div className={styles.heroMobileTitleBlock}>
                <LogoMark className={styles.heroMobileMark} />
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
                    {phrase.replace(/\.{3}$/, '…')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.heroMobileComposer}>
            <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />
          </div>
        </>
      )}
    </div>
  );
}
