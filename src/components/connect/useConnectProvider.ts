import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { setKey } from '@/lib/keys/store';
import { ANTHROPIC_ENDPOINT, isValidBaseUrl, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';

// Hook: useConnectProvider
// Responsibility: The one way a key or a server gets connected, shared by the
// welcome page's connect box and the setup sheet.

export type ConnectChoice = 'openrouter' | 'anthropic' | 'local';

/** Where each provider hands out keys. */
export const KEY_PAGES = {
  openrouter: { href: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys' },
  anthropic: {
    href: 'https://console.anthropic.com/settings/keys',
    label: 'console.anthropic.com',
  },
} as const;

const KEY_ENDPOINTS = { openrouter: OPENROUTER_ENDPOINT, anthropic: ANTHROPIC_ENDPOINT };

export const VALUE_PLACEHOLDERS: Record<ConnectChoice, string> = {
  openrouter: 'sk-or-…',
  anthropic: 'sk-ant-…',
  local: 'e.g. http://localhost:11434/v1',
};

export function useConnectProvider() {
  const { loadModels, addEndpoint } = useChatStore(
    (s) => ({ loadModels: s.loadModels, addEndpoint: s.addEndpoint }),
    shallow,
  );
  const [busy, setBusy] = useState(false);
  const [urlInvalid, setUrlInvalid] = useState(false);

  /**
   * Saves the key or adds the server, then loads its models in the
   * background. False when nothing was saved.
   */
  const connect = async (choice: ConnectChoice, value: string, label = ''): Promise<boolean> => {
    if (!value.trim() || busy) return false;
    // An unreachable server is still saved (it may simply not be running
    // yet); an address that is not one would only ever reach this page.
    if (choice === 'local' && !isValidBaseUrl(value)) {
      setUrlInvalid(true);
      return false;
    }
    setBusy(true);
    try {
      if (choice === 'local') {
        addEndpoint({
          kind: 'openai-compatible',
          label: label.trim() || 'Local model',
          baseUrl: value.trim(),
        });
      } else {
        await setKey(KEY_ENDPOINTS[choice].apiKeyRef ?? choice, value.trim());
      }
    } finally {
      setBusy(false);
    }
    void loadModels();
    return true;
  };

  return { connect, busy, urlInvalid, clearUrlInvalid: () => setUrlInvalid(false) };
}
