import { useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { isKeyRejected, setKey } from '@/lib/keys/store';
import { isEndpointUsable } from '@/lib/auth/require';
import {
  ANTHROPIC_ENDPOINT,
  INVALID_BASE_URL_MESSAGE,
  isValidBaseUrl,
  normalizeBaseUrl,
  OPENROUTER_ENDPOINT,
} from '@/lib/transport/endpoints';

// Hook: useConnectProvider
// Responsibility: The one way a key or a server gets connected, shared by the
// welcome page's connect box and the setup sheet.

export type ConnectChoice = 'openrouter' | 'anthropic' | 'local';
export type KeyChoice = Exclude<ConnectChoice, 'local'>;

/** What each way to connect is called, wherever it is offered. */
export const CONNECT_OPTIONS: Record<
  ConnectChoice,
  { name: string; note: string; placeholder: string }
> = {
  openrouter: { name: 'OpenRouter key', note: 'Most models, one key', placeholder: 'sk-or-…' },
  anthropic: { name: 'Anthropic key', note: 'Claude models only', placeholder: 'sk-ant-…' },
  local: {
    name: 'Your own server',
    note: 'Ollama, LM Studio and similar',
    placeholder: 'e.g. http://localhost:11434/v1',
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

/** A key pasted under the other provider goes to the one its prefix names. */
export function keyChoiceFor(choice: ConnectChoice, value: string): ConnectChoice {
  if (choice === 'local') return choice;
  const key = value.trim();
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  return choice;
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

export function refusedKeyMessage(choice: KeyChoice): string {
  const provider = choice === 'anthropic' ? 'Anthropic' : 'OpenRouter';
  return `${provider} did not accept that key. Check that you copied all of it, or create a new one.`;
}

const SERVER_SILENT = 'Could not get any models from that address. Is the server running?';
const KEY_NOT_SAVED =
  'This browser could not save your key, so it works only until you close this page.';

export function useConnectProvider() {
  const { loadModels, addEndpoint, removeEndpoint, setNotice } = useChatStore(
    (s) => ({
      loadModels: s.loadModels,
      addEndpoint: s.addEndpoint,
      removeEndpoint: s.removeEndpoint,
      setNotice: s.setNotice,
    }),
    shallow,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Set at once: a second press can land before the render that disables it.
  const busyRef = useRef(false);
  // The server this form added that never answered: a corrected address
  // replaces it rather than joining it.
  const addedRef = useRef<string>();

  const saveServer = (address: string) => {
    const baseUrl = normalizeBaseUrl(address);
    if (addedRef.current) removeEndpoint(addedRef.current);
    addedRef.current = undefined;
    const existing = useChatStore
      .getState()
      .customEndpoints.find((endpoint) => endpoint.baseUrl === baseUrl);
    if (existing) return existing;
    const endpoint = addEndpoint({
      kind: 'openai-compatible',
      label: serverName(baseUrl),
      baseUrl,
    });
    addedRef.current = endpoint.id;
    return endpoint;
  };

  /**
   * Saves the key or the server and loads its models. True once it offers a
   * model; otherwise `error` (or the refused key) says why.
   */
  const connect = async (choice: ConnectChoice, value: string): Promise<boolean> => {
    if (!value.trim() || busyRef.current) return false;
    // An unreachable server is still saved (it may simply not be running
    // yet); an address that is not one would only ever reach this page.
    if (choice === 'local' && !isValidBaseUrl(value)) {
      setError(INVALID_BASE_URL_MESSAGE);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (choice === 'local') {
        const endpoint = saveServer(value);
        await loadModels();
        if (!isEndpointUsable(endpoint, useChatStore.getState().models)) {
          setError(SERVER_SILENT);
          return false;
        }
        addedRef.current = undefined;
        return true;
      }
      try {
        await setKey(KEY_REFS[choice], value);
      } catch {
        // The key is held for this page, so it still connects.
        setNotice(KEY_NOT_SAVED);
      }
      await loadModels();
      return !isKeyRejected(KEY_REFS[choice]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { connect, busy, error, clearError: () => setError(undefined) };
}
