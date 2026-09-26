import { useChatStore } from '@/lib/store';
import { Composer } from '@/components/chat/Composer';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { readNextOverrides } from '@/lib/ui/next';
import { LogoMark } from '@/components/ui/LogoMark';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import styles from './WelcomeHero.module.css';

export function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  const ui = useChatStore((s) => s.ui);
  // One layout at a time: two mounted composers fought over the shared
  // composer height and the phone's focus state.
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const experimentalTutor = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!ui.tutor?.forceMode;
  const nextTutorMode = !!readNextOverrides(ui).tutorMode;
  const tutorActive = experimentalTutor && (forceTutorMode || nextTutorMode);

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
            <h1 className={styles.headline}>{heroTitle}</h1>
          </div>

          <div className={styles.composer}>
            <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
          </div>
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
