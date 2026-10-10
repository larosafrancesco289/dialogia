import { useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { deleteKey, isKeyRejected, setKey } from '@/lib/keys/store';
import {
  ANTHROPIC_ENDPOINT,
  ANTHROPIC_ENDPOINT_ID,
  isValidBaseUrl,
  normalizeBaseUrl,
  OPENROUTER_ENDPOINT,
  OPENROUTER_ENDPOINT_ID,
} from '@/lib/transport/endpoints';
import { useT, type MessageKey, type Translate } from '@/lib/i18n';

// Hook: useConnectProvider
// Responsibility: The one way a key or a server gets connected, shared by the
// welcome page's connect box and the setup sheet.

export type ConnectChoice = 'openrouter' | 'anthropic' | 'local';
export type KeyChoice = Exclude<ConnectChoice, 'local'>;

/** What each way to connect is called, wherever it is offered. */
export const CONNECT_OPTIONS: Record<
  ConnectChoice,
  { name: MessageKey; note: MessageKey; placeholder: string }
> = {
  openrouter: {
    name: 'connect.option.openrouter',
    note: 'connect.option.openrouterNote',
    placeholder: 'sk-or-…',
  },
  anthropic: {
    name: 'connect.option.anthropic',
    note: 'connect.option.anthropicNote',
    placeholder: 'sk-ant-…',
  },
  local: {
    name: 'connect.option.local',
    note: 'connect.option.localNote',
    placeholder: 'http://localhost:11434/v1',
  },
};

/** Where each provider hands out keys. */
export const KEY_PAGES = {
  openrouter: { href: 'https://openrouter.ai/keys' },
  anthropic: { href: 'https://console.anthropic.com/settings/keys' },
} as const;

const KEY_REFS: Record<KeyChoice, string> = {
  openrouter: OPENROUTER_ENDPOINT.apiKeyRef ?? 'openrouter',
  anthropic: ANTHROPIC_ENDPOINT.apiKeyRef ?? 'anthropic',
};

const KEY_ENDPOINTS: Record<KeyChoice, string> = {
  openrouter: OPENROUTER_ENDPOINT_ID,
  anthropic: ANTHROPIC_ENDPOINT_ID,
};

/** How each provider's keys begin. */
const KEY_PREFIXES: Record<KeyChoice, string> = {
  openrouter: 'sk-or-',
  anthropic: 'sk-ant-',
};

const PROVIDER_NAMES: Record<KeyChoice, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
};

/** A key pasted under the other provider goes to the one its prefix names. */
export function keyChoiceFor(choice: ConnectChoice, value: string): ConnectChoice {
  if (choice === 'local') return choice;
  const key = value.trim();
  if (key.startsWith(KEY_PREFIXES.anthropic)) return 'anthropic';
  if (key.startsWith(KEY_PREFIXES.openrouter)) return 'openrouter';
  return choice;
}

/** Whether a pasted key begins the way the provider's keys do: no call is made for one that does not. */
export function looksLikeKey(choice: KeyChoice, value: string): boolean {
  return value.trim().startsWith(KEY_PREFIXES[choice]);
}

/** A server added by its address alone is named for what it is, else where it is. */
export function serverName(address: string): string {
  const { host, port } = new URL(address);
  if (port === '11434') return 'Ollama';
  if (port === '1234') return 'LM Studio';
  return host;
}

/** The provider whose saved key was refused this session, if any. */
export function refusedKeyChoice(): KeyChoice | undefined {
  return (Object.keys(KEY_REFS) as KeyChoice[]).find((choice) => isKeyRejected(KEY_REFS[choice]));
}

export function refusedKeyMessage(t: Translate, choice: KeyChoice): string {
  return t('connect.keyRefused', { provider: PROVIDER_NAMES[choice] });
}

export function useConnectProvider() {
  const { loadModels, probeServer, checkKey, addEndpoint, setNotice } = useChatStore(
    (s) => ({
      loadModels: s.loadModels,
      probeServer: s.probeServer,
      checkKey: s.checkKey,
      addEndpoint: s.addEndpoint,
      setNotice: s.setNotice,
    }),
    shallow,
  );
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Said under the error when the browser could not reach a server at all.
  const [corsHint, setCorsHint] = useState(false);
  // Set at once: a second press can land before the render that disables it.
  const busyRef = useRef(false);

  // A server already saved at this address is reused, not added again.
  const saveServer = (baseUrl: string) => {
    const saved = useChatStore.getState().customEndpoints.some((e) => e.baseUrl === baseUrl);
    if (!saved) addEndpoint({ kind: 'openai-compatible', label: serverName(baseUrl), baseUrl });
  };

  const fail = (message: string, unreachable = false) => {
    setError(message);
    setCorsHint(unreachable);
    return false;
  };

  /**
   * Checks the key or the server, then saves it and loads its models. True
   * once it offers a model; otherwise `error` says why, and nothing refused
   * is kept to fail again on every visit.
   */
  const connect = async (choice: ConnectChoice, value: string): Promise<boolean> => {
    if (!value.trim() || busyRef.current) return false;
    if (choice === 'local' && !isValidBaseUrl(value)) return fail(t('connect.invalidAddress'));
    if (choice !== 'local' && !looksLikeKey(choice, value)) {
      return fail(
        t('connect.keyFormat', {
          provider: PROVIDER_NAMES[choice],
          prefix: KEY_PREFIXES[choice],
        }),
      );
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setCorsHint(false);
    try {
      if (choice === 'local') {
        const baseUrl = normalizeBaseUrl(value);
        const probe = await probeServer(baseUrl);
        if (probe === 'unreachable') return fail(t('connect.serverUnreachable'), true);
        if (probe !== 'answered') return fail(t('connect.serverSilent'));
        saveServer(baseUrl);
        await loadModels();
        return true;
      }
      const ref = KEY_REFS[choice];
      if ((await checkKey(KEY_ENDPOINTS[choice], value)) === 'refused') {
        return fail(refusedKeyMessage(t, choice));
      }
      try {
        await setKey(ref, value);
      } catch {
        // The key is held for this page, so it still connects.
        setNotice(t('connect.keyNotSaved'));
      }
      await loadModels();
      if (!isKeyRejected(ref)) return true;
      // Refused only once saved (the check could not reach the provider).
      await deleteKey(ref).catch(() => undefined);
      return fail(refusedKeyMessage(t, choice));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const clearError = () => {
    setError(undefined);
    setCorsHint(false);
  };

  return { connect, busy, error, corsHint, clearError };
}
