import { motionTransition } from '@/lib/ui/motion';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { DialogOverlay, DialogPortal } from '@/components/ui/Dialog';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useChatStore } from '@/lib/store';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useModalFocus } from '@/lib/hooks/useModalFocus';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { COMPOSER_FIELD_SELECTOR, indexForKey } from '@/lib/ui/focus';
import { INVALID_BASE_URL_MESSAGE } from '@/lib/transport/endpoints';
import {
  KEY_PAGES,
  useConnectProvider,
  VALUE_PLACEHOLDERS,
  type ConnectChoice,
} from '@/components/connect/useConnectProvider';

// Component: SetupSheet
// Responsibility: Connecting a provider when asked for (Connect a model, a send
// with no key). On first run the welcome page asks instead, in the composer's
// place.

const CHOICES: { id: ConnectChoice; label: string }[] = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'local', label: 'Local' },
];

const KEY_HINTS: Record<Exclude<ConnectChoice, 'local'>, ReactNode> = {
  openrouter: (
    <>
      One key, most models. Create one at{' '}
      <ExternalLink href={KEY_PAGES.openrouter.href}>{KEY_PAGES.openrouter.label}</ExternalLink>.
    </>
  ),
  anthropic: (
    <>
      Claude models directly. Create one at{' '}
      <ExternalLink href={KEY_PAGES.anthropic.href}>{KEY_PAGES.anthropic.label}</ExternalLink>.
    </>
  ),
};

export function SetupSheet() {
  const setUI = useChatStore((s) => s.setUI);
  const [choice, setChoice] = useState<ConnectChoice>('openrouter');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const { connect, busy, urlInvalid, clearUrlInvalid } = useConnectProvider();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  // A touch screen starts on the dialog itself: focusing the field would
  // raise the keyboard over a dialog not yet read.
  const isTouch = useMediaQuery(MEDIA_QUERIES.touch);

  const close = () => setUI({ setupOpen: false });

  useBackToClose(true, close);
  useModalFocus(true, surfaceRef, {
    initialFocus: isTouch ? undefined : valueRef,
    onEscape: close,
    // On first run nothing had focus before it; the composer is where to go
    // next, except on a touch screen, where focusing it raises the keyboard.
    fallback: () => (isTouch ? null : document.querySelector<HTMLElement>(COMPOSER_FIELD_SELECTOR)),
  });

  const canSubmit = value.trim().length > 0;

  const choose = (next: ConnectChoice) => {
    setChoice(next);
    setValue('');
    clearUrlInvalid();
  };

  const submit = async () => {
    if (!(await connect(choice, value, label))) return;
    setValue('');
    close();
  };

  // Closing hands focus back to the opener while the key is still down, and
  // the key's default would then press whatever took it.
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void submit();
  };

  return (
    // Above the settings drawer (z-[80]): the sheet is reachable from inside it,
    // and a first-run modal rendered underneath is a dead end.
    <DialogPortal>
      <DialogOverlay className="scrim z-[90]" onClose={close}>
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <motion.div
            ref={surfaceRef}
            className="dialog max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            // A click on its text keeps focus in the dialog instead of dropping it.
            tabIndex={-1}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition.quick}
          >
            <h2 id="setup-title" className="dialog__title">
              Connect a model
            </h2>
            <p className="dialog__lead">
              {choice === 'local'
                ? 'Dialogia talks to a model server you run, on this computer or your network, straight from this browser. Most local servers need no key.'
                : 'Dialogia talks to providers straight from this browser. A key is like a password from a provider: it lets Dialogia use their models, and you pay them for what you use. Your key is stored here and nowhere else.'}
            </p>

            <div className="segmented mt-5" role="tablist" aria-label="Provider">
              {CHOICES.map((option, index) => (
                <button
                  key={option.id}
                  id={`setup-tab-${option.id}`}
                  type="button"
                  role="tab"
                  aria-selected={choice === option.id}
                  aria-controls="setup-panel"
                  tabIndex={choice === option.id ? 0 : -1}
                  className={`segment${choice === option.id ? ' is-active' : ''}`}
                  onClick={() => choose(option.id)}
                  onKeyDown={(event) => {
                    const next = indexForKey(event.key, index, CHOICES.length, 'both');
                    if (next === null) return;
                    event.preventDefault();
                    choose(CHOICES[next].id);
                    document.getElementById(`setup-tab-${CHOICES[next].id}`)?.focus();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div id="setup-panel" role="tabpanel" aria-labelledby={`setup-tab-${choice}`}>
              {choice === 'local' ? (
                <div className="mt-4 space-y-3">
                  <div className="field">
                    <label className="field__label" htmlFor="setup-label">
                      Name
                    </label>
                    <input
                      id="setup-label"
                      className="input w-full text-base sm:text-sm"
                      value={label}
                      // "e.g.", so an example never reads as a value already filled in.
                      placeholder="e.g. Ollama"
                      onChange={(event) => setLabel(event.target.value)}
                      onKeyDown={submitOnEnter}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="setup-value">
                      Base URL
                    </label>
                    <input
                      ref={valueRef}
                      id="setup-value"
                      className="input w-full text-base sm:text-sm"
                      placeholder={VALUE_PLACEHOLDERS.local}
                      spellCheck={false}
                      value={value}
                      aria-invalid={urlInvalid || undefined}
                      aria-describedby="setup-value-hint"
                      onChange={(event) => {
                        setValue(event.target.value);
                        clearUrlInvalid();
                      }}
                      onKeyDown={submitOnEnter}
                    />
                    <p
                      id="setup-value-hint"
                      className="field__hint"
                      role={urlInvalid ? 'alert' : undefined}
                    >
                      {urlInvalid
                        ? INVALID_BASE_URL_MESSAGE
                        : 'Any OpenAI-compatible server: Ollama, LM Studio, llama.cpp, vLLM. Tools and search stay off until you turn them on in Settings › Connections.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="field mt-4">
                  <label className="field__label" htmlFor="setup-value">
                    API key
                  </label>
                  <input
                    ref={valueRef}
                    id="setup-value"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="input w-full text-base sm:text-sm"
                    placeholder={VALUE_PLACEHOLDERS[choice]}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={submitOnEnter}
                  />
                  <p className="field__hint">{KEY_HINTS[choice]}</p>
                </div>
              )}
            </div>

            <div className="dialog__actions">
              <button className="btn-ghost btn-sm" onClick={close}>
                Not now
              </button>
              <button
                className="btn btn-sm"
                disabled={!canSubmit || busy}
                onClick={() => void submit()}
              >
                {choice === 'local' ? 'Add server' : 'Save key'}
              </button>
            </div>
          </motion.div>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
