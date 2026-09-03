import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { DialogPortal } from '@/components/ui/Dialog';
import { useChatStore } from '@/lib/store';
import { IntroArt, type IntroPlate } from '@/components/intro/IntroArt';
import styles from './IntroTour.module.css';

// Component: IntroTour
// Responsibility: The first-run tour. It is the only place the app explains
// itself, so the chat surfaces stay clean. Any dismissal is permanent: the flag
// lives in persisted UI state, not in this component.

const REPO_URL = 'https://github.com/larosafrancesco289/dialogia';

type IntroPage = {
  id: string;
  plate: IntroPlate;
  title: string;
  paragraphs: string[];
  link?: { label: string; href: string };
};

const PAGES: IntroPage[] = [
  {
    id: 'welcome',
    plate: 'flourish',
    title: 'Welcome to Dialogia',
    paragraphs: [
      'Dialogia is a chat app for language models. It runs entirely in your browser. You bring a key from a provider, pick a model, and start.',
      'This tour takes a minute. You can close it at any time.',
    ],
  },
  {
    id: 'keys',
    plate: 'key',
    title: 'Bring your own key',
    paragraphs: [
      'Dialogia has no accounts and no subscription. You connect a key from a model provider and pay the provider directly for what you use.',
      'OpenRouter is the simplest start. One key there reaches models from many labs, with a single balance to top up. You can also use an Anthropic key directly.',
      'Your key is saved in this browser and sent only to the provider it belongs to.',
    ],
  },
  {
    id: 'local',
    plate: 'machine',
    title: 'Or run models on your own machine',
    paragraphs: [
      'Dialogia also talks to models running on your computer, through tools such as Ollama or LM Studio. Point it at a local endpoint and nothing leaves your machine at all.',
      'The code is open source under the MIT license. You can read it, run it yourself, and change it.',
    ],
    link: { label: 'Read the code on GitHub', href: REPO_URL },
  },
  {
    id: 'privacy',
    plate: 'ledger',
    title: 'Private by design',
    paragraphs: [
      'Your conversations live in this browser. There is no server behind this site, no database, and no analytics. Messages go only to the provider you chose.',
      'Providers have their own retention policies. With OpenRouter you can restrict Dialogia to providers that keep nothing after the reply. That option is called zero data retention. It is off by default. You can turn it on in Settings under Appearance, in the Privacy section.',
    ],
  },
];

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function IntroTour() {
  const setUI = useChatStore((s) => s.setUI);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const page = PAGES[index];
  const isLast = index === PAGES.length - 1;
  const titleId = useMemo(() => `intro-tour-title-${page.id}`, [page.id]);

  const dismiss = useCallback(() => setLeaving(true), []);

  // The flag is committed on a timer rather than on an exit-animation callback:
  // a fade that never reports completion would leave the tour showing forever.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setUI({ introSeen: true }), 180);
    return () => window.clearTimeout(timer);
  }, [leaving, setUI]);

  const goTo = useCallback((next: number) => {
    setIndex((current) => {
      const clamped = Math.max(0, Math.min(PAGES.length - 1, next));
      return clamped === current ? current : clamped;
    });
  }, []);

  // The tour owns the whole screen while it is up: no background scroll, and no
  // tabbing out of it.
  useEffect(() => {
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((current) => Math.min(PAGES.length - 1, current + 1));
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const targets = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === card,
      );
      if (targets.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || active === card || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !card.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dismiss]);

  return (
    <DialogPortal>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        style={leaving ? { pointerEvents: 'none' } : undefined}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}
      >
        <motion.div
          ref={cardRef}
          className={styles.card}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.rule} aria-hidden="true" />

          <div className={styles.topBar}>
            <span className={styles.step}>
              {index + 1} of {PAGES.length}
            </span>
            <button
              type="button"
              className={styles.close}
              onClick={dismiss}
              aria-label="Close the tour"
              title="Close the tour"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Keyed on the page, so React remounts and the entrance replays.
              There is deliberately no exit animation: an exit that never
              reports completion strands a paged dialog on the wrong page. */}
          <motion.div
            key={page.id}
            className={styles.page}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
          >
            <div className={styles.art}>
              <IntroArt plate={page.plate} />
            </div>
            <h2 id={titleId} className={styles.title}>
              {page.title}
            </h2>
            <div className={styles.prose}>
              {page.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
              {page.link && (
                <a
                  className={styles.link}
                  href={page.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {page.link.label}
                </a>
              )}
            </div>
          </motion.div>

          <div className={styles.footer}>
            <nav className={styles.dots} aria-label="Tour pages">
              {PAGES.map((entry, entryIndex) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.dot} ${entryIndex === index ? styles.dotActive : ''}`}
                  aria-label={`Go to page ${entryIndex + 1}, ${entry.title}`}
                  aria-current={entryIndex === index ? 'step' : undefined}
                  onClick={() => goTo(entryIndex)}
                />
              ))}
            </nav>

            <div className={styles.actions}>
              <button type="button" className={styles.skip} onClick={dismiss}>
                Skip
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => (isLast ? dismiss() : goTo(index + 1))}
              >
                {isLast ? 'Begin' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </DialogPortal>
  );
}
