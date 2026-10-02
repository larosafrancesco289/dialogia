import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { INVALID_BASE_URL_MESSAGE } from '@/lib/transport/endpoints';
import { ExternalLink } from '@/components/ui/ExternalLink';
import {
  KEY_PAGES,
  useConnectProvider,
  VALUE_PLACEHOLDERS,
  type ConnectChoice,
} from '@/components/connect/useConnectProvider';
import styles from './WelcomeConnect.module.css';

// Component: WelcomeConnect
// Responsibility: The welcome page's first step. With nothing connected it
// stands where the composer will be and asks for the one thing the app needs;
// once a key is saved the page puts the composer back in its place.

const OPTIONS: Record<ConnectChoice, { name: string; note: string; lead: string }> = {
  openrouter: {
    name: 'OpenRouter key',
    note: 'Most models, one key',
    lead: 'Paste a key from OpenRouter. One key reaches most models, and you pay OpenRouter only for what you use.',
  },
  anthropic: {
    name: 'Anthropic key',
    note: 'Claude models only',
    lead: 'Paste a key from Anthropic to use Claude models. You pay Anthropic only for what you use.',
  },
  local: {
    name: 'A server on this computer',
    note: 'Ollama, LM Studio',
    lead: 'Paste the address of a model server you run, such as Ollama or LM Studio. Most need no key.',
  },
};

const ORDER: ConnectChoice[] = ['openrouter', 'anthropic', 'local'];

const KEY_STEPS: Record<Exclude<ConnectChoice, 'local'>, ReactNode[]> = {
  openrouter: [
    <>
      <b>Make an account</b> at{' '}
      <ExternalLink href="https://openrouter.ai">openrouter.ai</ExternalLink>. It takes a minute.
    </>,
    <>
      <b>Add a little credit</b> under Credits. You pay only for what you use.
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
      <b>Add a little credit</b> under Billing. You pay only for what you use.
    </>,
    <>
      <b>Create a key</b> under{' '}
      <ExternalLink href={KEY_PAGES.anthropic.href}>API keys</ExternalLink>, copy it, and paste it
      above.
    </>,
  ],
};

export function WelcomeConnect() {
  const [choice, setChoice] = useState<ConnectChoice>('openrouter');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState<'steps' | 'others' | null>(null);
  const { connect, busy, urlInvalid, clearUrlInvalid } = useConnectProvider();
  const inputRef = useRef<HTMLInputElement>(null);
  // Focusing the field on a touch screen would raise the keyboard over a page
  // not yet read.
  const isTouch = useMediaQuery(MEDIA_QUERIES.touch);

  useEffect(() => {
    if (!isTouch) inputRef.current?.focus();
  }, [isTouch, choice]);

  const choose = (next: ConnectChoice) => {
    setChoice(next);
    setValue('');
    setOpen(null);
    clearUrlInvalid();
  };
  const toggle = (panel: 'steps' | 'others') => setOpen((now) => (now === panel ? null : panel));

  const option = OPTIONS[choice];
  const steps = choice === 'local' ? null : KEY_STEPS[choice];

  return (
    <div className={styles.connect}>
      <form
        className={styles.box}
        onSubmit={(event) => {
          event.preventDefault();
          void connect(choice, value);
        }}
      >
        <h2 className={styles.title}>First, connect a model</h2>
        <p className={styles.lead}>{option.lead}</p>
        <div className={styles.row}>
          <input
            ref={inputRef}
            className="input w-full text-base sm:text-sm"
            type={choice === 'local' ? 'url' : 'password'}
            autoComplete="off"
            spellCheck={false}
            aria-label={choice === 'local' ? 'Server address' : option.name}
            aria-invalid={urlInvalid || undefined}
            aria-describedby={urlInvalid ? 'welcome-connect-error' : undefined}
            placeholder={VALUE_PLACEHOLDERS[choice]}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              clearUrlInvalid();
            }}
          />
          <button type="submit" className="btn" disabled={!value.trim() || busy}>
            {choice === 'local' ? 'Add server' : 'Connect'}
          </button>
        </div>
        {urlInvalid && (
          <p id="welcome-connect-error" className={styles.error} role="alert">
            {INVALID_BASE_URL_MESSAGE}
          </p>
        )}
        {steps && open === 'steps' && (
          <ol id="welcome-connect-steps" className={`${styles.steps} motion-fade`}>
            {steps.map((step, index) => (
              <li key={index}>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </form>

      <div className={styles.links}>
        {steps ? (
          <button
            type="button"
            className={styles.link}
            aria-expanded={open === 'steps'}
            aria-controls="welcome-connect-steps"
            onClick={() => toggle('steps')}
          >
            {open === 'steps' ? 'Hide the steps' : 'How do I get a key?'}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={styles.link}
          aria-expanded={open === 'others'}
          aria-controls="welcome-connect-others"
          onClick={() => toggle('others')}
        >
          Other ways to connect
        </button>
      </div>

      {open === 'others' && (
        <div id="welcome-connect-others" className={`${styles.others} motion-fade`}>
          {ORDER.filter((id) => id !== choice).map((id) => (
            <button key={id} type="button" className={styles.other} onClick={() => choose(id)}>
              {OPTIONS[id].name}
              <span>{OPTIONS[id].note}</span>
            </button>
          ))}
        </div>
      )}

      <p className={styles.privacy}>Your key and your chats stay in this browser.</p>
    </div>
  );
}
