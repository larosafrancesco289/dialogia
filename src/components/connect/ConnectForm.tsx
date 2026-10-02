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

// Component: ConnectForm
// Responsibility: Asking for a key or a server, the same way wherever it is
// asked: in the composer's place on the welcome page, and in the setup sheet.

/** The field of whichever connect form is showing. */
export const CONNECT_FIELD_SELECTOR = '[data-connect-field]';

const CHOICES = Object.keys(CONNECT_OPTIONS) as ConnectChoice[];

const LEADS: Record<ConnectChoice, string> = {
  openrouter:
    'Paste a key from OpenRouter. One key reaches most models, and you pay OpenRouter only for what you use.',
  anthropic:
    'Paste a key from Anthropic to use Claude models. You pay Anthropic only for what you use.',
  local:
    'Paste the address of a model server you run, such as Ollama or LM Studio. Most need no key.',
};

const KEY_STEPS: Record<KeyChoice, ReactNode[]> = {
  openrouter: [
    <>
      <b>Make an account</b> at{' '}
      <ExternalLink href="https://openrouter.ai">openrouter.ai</ExternalLink>.
    </>,
    <>
      <b>Add a little credit</b> under Credits.
    </>,
    <>
      <b>Create a key</b> under <ExternalLink href={KEY_PAGES.openrouter.href}>Keys</ExternalLink>,
      copy it, and paste it above.
    </>,
  ],
  anthropic: [
    <>
      <b>Make an account</b> at{' '}
      <ExternalLink href="https://console.anthropic.com">console.anthropic.com</ExternalLink>.
    </>,
    <>
      <b>Add a little credit</b> under Billing.
    </>,
    <>
      <b>Create a key</b> under{' '}
      <ExternalLink href={KEY_PAGES.anthropic.href}>API keys</ExternalLink>, copy it, and paste it
      above.
    </>,
  ],
};

type Fold = 'steps' | 'others';

export function ConnectForm({
  id,
  title,
  variant,
  autoFocus = false,
  inputRef: givenInputRef,
  onConnected,
}: {
  /** Prefixes the ids of the form's parts; the title's is `${id}-title`. */
  id: string;
  title: string;
  /** A box of its own where the composer will be, or the body of a dialog. */
  variant: 'box' | 'dialog';
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  onConnected?: () => void;
}) {
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
    (keyChoice && keyChoice === refused && !value ? refusedKeyMessage(keyChoice) : undefined);
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
        <p className={styles.lead}>{LEADS[choice]}</p>
        <div className={styles.row}>
          <input
            ref={inputRef}
            data-connect-field=""
            className="input w-full text-base sm:text-sm"
            type={keyChoice ? 'password' : 'url'}
            autoComplete="off"
            // A key is not a password to remember: password managers leave it be.
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            spellCheck={false}
            aria-label={keyChoice ? CONNECT_OPTIONS[keyChoice].name : 'Server address'}
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
            Connect
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
              How do I get a key?
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
            Other ways to connect
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
              {KEY_STEPS[keyChoice].map((step, index) => (
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
                <span>{CONNECT_OPTIONS[other].name}</span>{' '}
                <span className={styles.note}>{CONNECT_OPTIONS[other].note}</span>
              </button>
            ))}
          </div>
        </div>
      </form>

      <p className={styles.privacy}>
        {keyChoice
          ? 'Your key and your chats stay in this browser.'
          : 'Your chats stay in this browser.'}
      </p>
    </div>
  );
}
