import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { isModalOpen } from '@/lib/hooks/useModalFocus';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { ExternalLink } from '@/components/ui/ExternalLink';
import {
  CONNECT_OPTIONS,
  KEY_PAGES,
  keyChoiceFor,
  refusedKeyChoice,
  refusedKeyMessage,
  useConnectProvider,
  type ConnectChoice,
  type KeyChoice,
} from '@/components/connect/useConnectProvider';
import styles from './ConnectForm.module.css';
import { useT, type MessageKey, type Translate } from '@/lib/i18n';

// Component: ConnectForm
// Responsibility: Asking for a key or a server, the same way wherever it is
// asked: in the composer's place on the welcome page, and in the setup sheet.

/** The field of whichever connect form is showing. */
export const CONNECT_FIELD_SELECTOR = '[data-connect-field]';

const CHOICES = Object.keys(CONNECT_OPTIONS) as ConnectChoice[];

const LEADS: Record<ConnectChoice, MessageKey> = {
  openrouter: 'connect.lead.openrouter',
  anthropic: 'connect.lead.anthropic',
  local: 'connect.lead.local',
};

// The provider's own page names (Credits, Keys) stay as its site writes them.
const KEY_SITES: Record<KeyChoice, { home: string; credit: string; keys: string }> = {
  openrouter: { home: 'openrouter.ai', credit: 'Credits', keys: 'Keys' },
  anthropic: { home: 'console.anthropic.com', credit: 'Billing', keys: 'API keys' },
};

function keySteps(t: Translate, choice: KeyChoice): ReactNode[] {
  const site = KEY_SITES[choice];
  return [
    t.rich('connect.steps.account', {
      action: <b>{t('connect.steps.accountAction')}</b>,
      link: <ExternalLink href={`https://${site.home}`}>{site.home}</ExternalLink>,
    }),
    t.rich('connect.steps.credit', {
      action: <b>{t('connect.steps.creditAction')}</b>,
      page: site.credit,
    }),
    t.rich('connect.steps.key', {
      action: <b>{t('connect.steps.keyAction')}</b>,
      link: <ExternalLink href={KEY_PAGES[choice].href}>{site.keys}</ExternalLink>,
    }),
  ];
}

type Fold = 'steps' | 'others';

export function ConnectForm({
  id,
  title,
  lead,
  variant,
  autoFocus = false,
  inputRef: givenInputRef,
  onConnected,
}: {
  /** Prefixes the ids of the form's parts; the title's is `${id}-title`. */
  id: string;
  title: string;
  /** Why it is asked for, in place of the provider's own lead. */
  lead?: string;
  /** A box of its own where the composer will be, or the body of a dialog. */
  variant: 'box' | 'dialog';
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  onConnected?: () => void;
}) {
  const t = useT();
  // A key refused since it was saved brings the form back on it, saying so.
  useProviderKeys();
  const refused = refusedKeyChoice();
  const [choice, setChoice] = useState<ConnectChoice>(() => refused ?? 'openrouter');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState<Fold | null>(null);
  const { connect, busy, error, clearError } = useConnectProvider();
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = givenInputRef ?? ownInputRef;
  const stepsToggleRef = useRef<HTMLButtonElement>(null);
  const othersToggleRef = useRef<HTMLButtonElement>(null);
  const foldsRef = useRef<HTMLDivElement>(null);
  // Focusing the field on a touch screen would raise the keyboard over a page
  // not yet read.
  const isTouch = useMediaQuery(MEDIA_QUERIES.touch);

  useEffect(() => {
    // Not from under a dialog opened over the page.
    if (autoFocus && !isTouch && !isModalOpen()) inputRef.current?.focus();
  }, [autoFocus, isTouch, inputRef]);

  const choose = (next: ConnectChoice) => {
    setChoice(next);
    setValue('');
    setOpen(null);
    clearError();
    // The row that was pressed goes from the list: focus moves on to the field.
    inputRef.current?.focus();
  };

  const closeFold = () => {
    if (!open) return;
    if (foldsRef.current?.contains(document.activeElement)) {
      (open === 'steps' ? stepsToggleRef : othersToggleRef).current?.focus();
    }
    setOpen(null);
  };

  const submit = async () => {
    // A key pasted under the other provider is saved where it belongs.
    const target = keyChoiceFor(choice, value);
    if (target !== choice) setChoice(target);
    if (await connect(target, value)) onConnected?.();
    // A refused key is cleared, so the note saying so shows in its place.
    else if (target !== 'local') setValue('');
  };

  const keyChoice = choice === 'local' ? null : choice;
  const shownError =
    error ??
    (keyChoice && keyChoice === refused && !value ? refusedKeyMessage(t, keyChoice) : undefined);
  const errorId = `${id}-error`;

  return (
    <div className={styles.connect}>
      <form
        className={variant === 'box' ? styles.box : undefined}
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          // Closes an open fold first; a dialog around the form closes next time.
          if (event.key !== 'Escape' || !open) return;
          event.preventDefault();
          closeFold();
        }}
      >
        <h2 id={`${id}-title`} className={variant === 'box' ? styles.title : 'dialog__title'}>
          {title}
        </h2>
        <p className={styles.lead}>{lead ?? t(LEADS[choice])}</p>
        <div className={styles.row} data-keyboard-reveal="">
          <input
            ref={inputRef}
            data-connect-field=""
            className="input w-full text-base sm:text-sm"
            type={keyChoice ? 'password' : 'url'}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            // A key is not a password to remember: password managers leave it be.
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            spellCheck={false}
            aria-label={t(keyChoice ? CONNECT_OPTIONS[keyChoice].name : 'connect.serverAddress')}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            placeholder={CONNECT_OPTIONS[choice].placeholder}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              clearError();
            }}
          />
          <button type="submit" className="btn btn-sm" disabled={!value.trim() || busy}>
            {t('connect.submit')}
          </button>
        </div>
        {shownError && (
          <p id={errorId} className={styles.error} role="alert">
            {shownError}
          </p>
        )}

        <div className={styles.toggles}>
          {keyChoice && (
            <button
              ref={stepsToggleRef}
              type="button"
              className={styles.toggle}
              aria-expanded={open === 'steps'}
              aria-controls={`${id}-steps`}
              onClick={() => setOpen(open === 'steps' ? null : 'steps')}
            >
              {t('connect.howToGetKey')}
              <ChevronDownIcon className={styles.chevron} aria-hidden="true" />
            </button>
          )}
          <button
            ref={othersToggleRef}
            type="button"
            className={styles.toggle}
            aria-expanded={open === 'others'}
            aria-controls={`${id}-others`}
            onClick={() => setOpen(open === 'others' ? null : 'others')}
          >
            {t('connect.otherWays')}
            <ChevronDownIcon className={styles.chevron} aria-hidden="true" />
          </button>
        </div>

        <div ref={foldsRef}>
          {keyChoice && (
            <ol
              id={`${id}-steps`}
              className={`${styles.steps} motion-fade`}
              hidden={open !== 'steps'}
            >
              {keySteps(t, keyChoice).map((step, index) => (
                <li key={index}>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <div
            id={`${id}-others`}
            className={`${styles.others} motion-fade`}
            hidden={open !== 'others'}
          >
            {CHOICES.filter((other) => other !== choice).map((other) => (
              <button
                key={other}
                type="button"
                className={styles.other}
                onClick={() => choose(other)}
              >
                <span>{t(CONNECT_OPTIONS[other].name)}</span>{' '}
                <span className={styles.note}>{t(CONNECT_OPTIONS[other].note)}</span>
              </button>
            ))}
          </div>
        </div>
      </form>

      <p className={styles.privacy}>
        {t(keyChoice ? 'connect.privacy.key' : 'connect.privacy.server')}
      </p>
    </div>
  );
}
