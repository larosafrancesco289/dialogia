import { useChatStore } from '@/lib/store';
import { selectIsTutorEnabled } from '@/lib/store/selectors';
import { Composer } from '@/components/chat/Composer';
import { ModuleSlot } from '@/components/ModuleSlot';
import { WelcomeConnect } from '@/components/welcome/WelcomeConnect';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { useAnyModelOffered } from '@/lib/hooks/useProviderKeys';
import { LogoMark } from '@/components/ui/LogoMark';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import styles from './WelcomeHero.module.css';

// Component: WelcomeHero
// Responsibility: The opening page of a dialogue, and the whole of first run.
// With nothing connected it welcomes and asks for a key where the composer
// will be; after that it is the mark, a headline and the composer, with the
// modes a chat can begin in above it.

export function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  // One layout at a time: two mounted composers fought over the shared
  // composer height and the phone's focus state.
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const connected = useAnyModelOffered();
  const tutorActive = useChatStore(selectIsTutorEnabled);
  const tutorOffered = useChatStore((s) => !!s.ui.flags.experimentalTutor);

  const headline = !connected ? (
    <>
      Welcome to <span className={styles.headlineEmphasis}>Dialogia</span>
    </>
  ) : tutorActive ? (
    // No longer than "Begin a new dialogue", so switching modes never
    // rewraps the headline and moves the switch from under the pointer.
    <>
      What will you <span className={styles.headlineEmphasis}>learn</span>?
    </>
  ) : (
    <>
      Begin a new <span className={styles.headlineEmphasis}>dialogue</span>
    </>
  );
  // Said once, on the page that asks for a key.
  const subline = connected
    ? null
    : tutorOffered
      ? 'Chat with the leading AI models, or learn something with a tutor.'
      : 'Chat with the leading AI models.';

  if (!isMobile) {
    return (
      <div className={styles.hero}>
        <div className={styles.heroDesktop}>
          <div className={styles.opening}>
            <LogoMark className={styles.mark} />
            <h1 className={styles.headline}>{headline}</h1>
            {subline && <p className={styles.subline}>{subline}</p>}
          </div>

          {/* Keyed, so the composer settles in when it takes the box's place. */}
          <div key={connected ? 'compose' : 'connect'} className={styles.composer}>
            {connected ? (
              <>
                <ModuleSlot slot="welcomeModes" />
                <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
              </>
            ) : (
              <WelcomeConnect />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Phone: the opening centred, the composer floating at the foot.
  return (
    <div className={styles.hero}>
      <div className={`${styles.heroMobile}${connected ? '' : ` ${styles.heroMobileConnect}`}`}>
        <div className={styles.heroMobileContent}>
          <div className={styles.heroMobileTitleBlock}>
            <LogoMark className={styles.heroMobileMark} />
            <h1 className={styles.heroMobileHeadline}>{headline}</h1>
            {subline && <p className={styles.subline}>{subline}</p>}
          </div>
          {connected ? (
            <div className={styles.heroMobileModes}>
              <ModuleSlot slot="welcomeModes" />
            </div>
          ) : (
            <WelcomeConnect />
          )}
        </div>
      </div>

      {connected && <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />}
    </div>
  );
}
