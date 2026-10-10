// Module: tutor tooling providers
// Responsibility: the tutor model's connection for the simulation CLIs: OpenRouter or the
// Claude API directly, its key from the environment, and the model's descriptor as the app
// would list it.

import path from 'node:path';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { loadEnvDefaults } from '@/lib/cli/env.node';
import {
  getAnthropicKeyFallback,
  getAnthropicWorkspaceFallback,
  getOpenRouterKeyFallback,
} from '@/lib/env/keys';
import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { getTransportClient } from '@/lib/transport/registry';
import type { ModelDescriptor } from '@/lib/types';

export type SimProvider = 'anthropic' | 'openrouter';

export const SIM_PROVIDERS: readonly SimProvider[] = ['anthropic', 'openrouter'];

export type ProviderConnection = {
  provider: SimProvider;
  auth: TransportAuth;
  /** The models as the app would list them; unlisted ones get a tool-capable stub. */
  describe: (ids: string[]) => Promise<ModelDescriptor[]>;
};

const KEY_NAME: Record<SimProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

function stubModel(id: string, endpointId: string): ModelDescriptor {
  return {
    id,
    name: id,
    endpointId,
    context_length: 200000,
    raw: { supported_parameters: ['tools', 'tool_choice', 'reasoning'] },
  };
}

/**
 * Connects to `provider` with the key from the environment, `.env.local`,
 * `.env` or `envFile`. `offline` skips the key and the model list: a scripted
 * pipeline answers instead.
 */
export async function connectProvider(
  provider: SimProvider,
  options: { offline?: boolean; envFile?: string } = {},
): Promise<ProviderConnection> {
  let key = 'offline';
  if (!options.offline) {
    await loadEnvDefaults([
      '.env.local',
      '.env',
      ...(options.envFile ? [path.resolve(options.envFile)] : []),
    ]);
    const found = provider === 'anthropic' ? getAnthropicKeyFallback() : getOpenRouterKeyFallback();
    if (!found) {
      throw new Error(
        `No ${KEY_NAME[provider]} in the environment, .env.local or .env (see --env-file).`,
      );
    }
    key = found;
  }
  const workspaceId = provider === 'anthropic' ? getAnthropicWorkspaceFallback() : undefined;
  const endpoint =
    provider === 'anthropic'
      ? { ...ANTHROPIC_ENDPOINT, ...(workspaceId ? { workspaceId } : {}) }
      : OPENROUTER_ENDPOINT;
  const auth = buildTransportAuth({ endpoint, apiKey: key });

  const describe = async (ids: string[]) => {
    let listed: ModelDescriptor[] = [];
    if (!options.offline) {
      try {
        listed = await getTransportClient(endpoint.kind).fetchModels(auth);
      } catch {
        listed = [];
      }
    }
    return ids.map((id) => listed.find((m) => m.id === id) ?? stubModel(id, endpoint.id));
  };

  return { provider, auth, describe };
}
