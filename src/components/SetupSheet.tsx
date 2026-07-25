'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { setKey } from '@/lib/keys/store';
import {
  ANTHROPIC_ENDPOINT,
  OPENROUTER_ENDPOINT,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';

// Component: SetupSheet
// Responsibility: The first-run path from "nothing configured" to "chatting".
// It replaces the notice that used to name an environment variable, which told
// the user about the developer's build rather than about anything they could do.

type Choice = 'openrouter' | 'anthropic' | 'local';

const KEY_HINTS: Record<Exclude<Choice, 'local'>, { endpoint: ProviderEndpoint; hint: string }> = {
  openrouter: {
    endpoint: OPENROUTER_ENDPOINT,
    hint: 'One key, most models. Create one at openrouter.ai/keys.',
  },
  anthropic: {
    endpoint: ANTHROPIC_ENDPOINT,
    hint: 'Claude models directly. Create one at console.anthropic.com.',
  },
};

export function SetupSheet() {
  const { setUI, loadModels, addEndpoint } = useChatStore(
    (s) => ({ setUI: s.setUI, loadModels: s.loadModels, addEndpoint: s.addEndpoint }),
    shallow,
  );
  const [choice, setChoice] = useState<Choice>('openrouter');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('Local model');
  const [busy, setBusy] = useState(false);

  const close = () => setUI({ setupOpen: false });

  const canSubmit = value.trim().length > 0 && (choice !== 'local' || label.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      if (choice === 'local') {
        addEndpoint({
          kind: 'openai-compatible',
          label: label.trim(),
          baseUrl: value.trim(),
        });
      } else {
        await setKey(KEY_HINTS[choice].endpoint.apiKeyRef ?? choice, value.trim());
      }
      setValue('');
      close();
      await loadModels();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
      <motion.div
        className="card relative w-full max-w-md p-5 space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="space-y-1">
          <h2 id="setup-title" className="text-base font-medium">
            Connect a model
          </h2>
          <p className="text-sm text-muted-foreground">
            Dialogia talks to providers straight from this browser. Your key is stored here and
            nowhere else.
          </p>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="Provider">
          {(['openrouter', 'anthropic', 'local'] as Choice[]).map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={choice === option}
              className={`btn btn-sm ${choice === option ? '' : 'btn-outline'}`}
              onClick={() => {
                setChoice(option);
                setValue('');
              }}
            >
              {option === 'openrouter'
                ? 'OpenRouter'
                : option === 'anthropic'
                  ? 'Anthropic'
                  : 'Local'}
            </button>
          ))}
        </div>

        {choice === 'local' ? (
          <div className="space-y-2">
            <label className="text-sm" htmlFor="setup-label">
              Name
            </label>
            <input
              id="setup-label"
              className="input w-full text-base sm:text-sm"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <label className="text-sm" htmlFor="setup-value">
              Base URL
            </label>
            <input
              id="setup-value"
              className="input w-full text-base sm:text-sm"
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Any OpenAI-compatible server: Ollama, LM Studio, llama.cpp, vLLM. Tools and search
              stay off until you turn them on in Settings › Providers.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm" htmlFor="setup-value">
              API key
            </label>
            <input
              id="setup-value"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="input w-full text-base sm:text-sm"
              placeholder={choice === 'anthropic' ? 'sk-ant-…' : 'sk-or-…'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
            <p className="text-xs text-muted-foreground">{KEY_HINTS[choice].hint}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={close}>
            Not now
          </button>
          <button
            className="btn btn-sm"
            disabled={!canSubmit || busy}
            onClick={() => void submit()}
          >
            {choice === 'local' ? 'Add endpoint' : 'Save key'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
