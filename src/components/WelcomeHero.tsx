import { useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectIsTutorEnabled } from '@/lib/store/selectors';
import { Composer } from '@/components/chat/Composer';
import { ModuleSlot } from '@/components/ModuleSlot';
import { ConnectForm } from '@/components/connect/ConnectForm';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';
import { useAnyModelOffered } from '@/lib/hooks/useProviderKeys';
import { LogoMark } from '@/components/ui/LogoMark';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { useT } from '@/lib/i18n';
import styles from './WelcomeHero.module.css';

// Component: WelcomeHero
// Responsibility: The opening page of a dialogue, and the whole of first run.
// With nothing connected it welcomes and asks for a key where the composer
// will be; after that it is the mark, a headline and the composer, with the
// modes a chat can begin in above it.

export function WelcomeHero({ keyboardMetrics }: { keyboardMetrics: KeyboardMetrics }) {
  // One layout at a time: two mounted composers fought over the shared
  // composer height and the phone's focus state.
  const t = useT();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const connected = useAnyModelOffered();
  const tutorActive = useChatStore(selectIsTutorEnabled);
  const tutorOffered = useChatStore((s) => !!s.ui.flags.experimentalTutor);
  // The Chat / Learn switch loads after the page: its room is kept, so the
  // composer does not drop when it arrives.
  const modesShown = useChatStore((s) => !!s.ui.flags.experimentalTutor && !s.ui.tutor?.forceMode);
  // "Connected" is said when the box gives way, not on a page that opened so.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (connected === false) setAsked(true);
  }, [connected]);

  // Until the keys are read, neither the box nor the composer is a fact.
  if (connected === undefined) return <div className={styles.hero} />;

  const emphasis = (word: string) => <span className={styles.headlineEmphasis}>{word}</span>;
  const headline = !connected
    ? t.rich('welcome.headline.first', { name: emphasis('Dialogia') })
    : tutorActive
      ? // No longer than "Begin a new dialogue", so switching modes never
        // rewraps the headline and moves the switch from under the pointer
        // (each language keeps its pair of headlines to one phone line).
        t.rich('welcome.headline.learn', { word: emphasis(t('welcome.headline.learnWord')) })
      : t.rich('welcome.headline.chat', { word: emphasis(t('welcome.headline.chatWord')) });
  // Said once, on the page that asks for a key.
  const subline = connected
    ? null
    : tutorOffered
      ? t('welcome.subline.withTutor')
      : t('welcome.subline');

  const connectBox = (
    <ConnectForm id="welcome-connect" title={t('welcome.connectTitle')} variant="box" autoFocus />
  );
  const status = (
    <p className="sr-only" role="status">
      {asked && connected ? t('welcome.connected') : ''}
    </p>
  );
  const modes = (
    <div className={styles.modes} data-reserved={modesShown || undefined}>
      <ModuleSlot slot="welcomeModes" />
    </div>
  );

  if (!isMobile) {
    return (
      <div className={styles.hero}>
        {status}
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
                {modes}
                <Composer variant="hero" keyboardMetrics={keyboardMetrics} />
              </>
            ) : (
              connectBox
            )}
          </div>
        </div>
      </div>
    );
  }

  // Phone: the opening centred, the composer floating at the foot.
  return (
    <div className={styles.hero}>
      {status}
      <div className={`${styles.heroMobile}${connected ? '' : ` ${styles.heroMobileConnect}`}`}>
        <div className={styles.heroMobileContent}>
          <div className={styles.heroMobileTitleBlock}>
            <LogoMark className={styles.heroMobileMark} />
            <h1 className={styles.heroMobileHeadline}>{headline}</h1>
            {subline && <p className={styles.subline}>{subline}</p>}
          </div>
          {connected ? modes : connectBox}
        </div>
      </div>

      {connected && <Composer variant="sticky" keyboardMetrics={keyboardMetrics} />}
    </div>
  );
}
