'use client';
import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { useChatStore } from '@/lib/store';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import { isTavilyProxyEnabled } from '@/lib/env/public';
import { listSearchProviders, searchProviderKeyRef } from '@/lib/search/providers';
import {
  endpointCapabilities,
  isBuiltInEndpointId,
  type EndpointCapabilities,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { listEndpoints } from '@/lib/transport/endpointRegistry';
import type { RenderSection } from '@/components/settings/types';

const CAPABILITY_LABELS: Array<{ key: keyof EndpointCapabilities; label: string; hint: string }> = [
  { key: 'tools', label: 'Tool calls', hint: 'Send tool definitions and accept tool calls.' },
  { key: 'vision', label: 'Images', hint: 'Accept image content blocks.' },
  { key: 'reasoning', label: 'Reasoning effort', hint: 'Send reasoning/effort parameters.' },
  { key: 'streamUsage', label: 'Usage in stream', hint: 'Ask for token usage on the last chunk.' },
  {
    key: 'parallelToolCalls',
    label: 'Parallel tool calls',
    hint: 'Allow more than one per round.',
  },
  { key: 'promptCaching', label: 'Prompt caching', hint: 'Send cache_control markers.' },
];

function EndpointStatus({ endpoint }: { endpoint: ProviderEndpoint }) {
  const { hasKey } = useProviderKeys();
  if (hasKey(endpoint.apiKeyRef)) {
    return <span className="text-xs text-muted-foreground">Using your key</span>;
  }
  if (endpoint.useProxy) {
    return <span className="text-xs text-muted-foreground">Keyed by this deployment</span>;
  }
  if (endpoint.kind === 'openai-compatible') {
    return <span className="text-xs text-muted-foreground">Ready (no key needed)</span>;
  }
  return <span className="text-xs text-muted-foreground">Needs a key</span>;
}

function CustomEndpointEditor({
  endpoint,
  onChanged,
}: {
  endpoint: ProviderEndpoint;
  onChanged: () => void;
}) {
  const { updateEndpoint, removeEndpoint } = useChatStore(
    (s) => ({ updateEndpoint: s.updateEndpoint, removeEndpoint: s.removeEndpoint }),
    shallow,
  );
  const caps = endpointCapabilities(endpoint);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm" htmlFor={`base-${endpoint.id}`}>
          Base URL
        </label>
        <input
          id={`base-${endpoint.id}`}
          className="input w-full text-base sm:text-sm"
          defaultValue={endpoint.baseUrl ?? ''}
          spellCheck={false}
          onBlur={(event) => {
            updateEndpoint(endpoint.id, { baseUrl: event.target.value });
            onChanged();
          }}
        />
        <p className="text-xs text-muted-foreground">
          The OpenAI-compatible root, e.g. http://localhost:11434/v1 for Ollama.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm" htmlFor={`models-${endpoint.id}`}>
          Model ids
        </label>
        <input
          id={`models-${endpoint.id}`}
          className="input w-full text-base sm:text-sm"
          defaultValue={(endpoint.modelIds ?? []).join(', ')}
          spellCheck={false}
          placeholder="qwen3:8b, llama3.2"
          onBlur={(event) => {
            updateEndpoint(endpoint.id, {
              modelIds: event.target.value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
            });
            onChanged();
          }}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated. Whatever this server lists at /models is added automatically.
        </p>
      </div>

      <ApiKeyField
        keyRef={endpoint.apiKeyRef ?? `endpoint:${endpoint.id}`}
        label="API key (optional)"
        placeholder="Most local servers need none"
        onChanged={onChanged}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm">What this server supports</legend>
        <p className="text-xs text-muted-foreground">
          Nothing unchecked is ever sent. A strict server rejects the whole request over one field
          it does not know.
        </p>
        {CAPABILITY_LABELS.map(({ key, label, hint }) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={caps[key]}
              onChange={(event) => {
                updateEndpoint(endpoint.id, {
                  capabilities: { ...caps, [key]: event.target.checked },
                });
                onChanged();
              }}
            />
            <span>
              {label}
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label className="text-sm" htmlFor={`title-${endpoint.id}`}>
          Chat titles
        </label>
        <select
          id={`title-${endpoint.id}`}
          className="input w-full text-base sm:text-sm"
          value={endpoint.disableTitleGeneration ? 'off' : 'chat-model'}
          onChange={(event) => {
            updateEndpoint(endpoint.id, {
              disableTitleGeneration: event.target.value === 'off' ? true : undefined,
            });
            onChanged();
          }}
        >
          <option value="chat-model">Use the chat&apos;s own model</option>
          <option value="off">Do not generate titles</option>
        </select>
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          removeEndpoint(endpoint.id);
          onChanged();
        }}
      >
        Remove this endpoint
      </button>
    </div>
  );
}

function AddEndpointForm({ onAdded }: { onAdded: () => void }) {
  const addEndpoint = useChatStore((s) => s.addEndpoint);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const canAdd = label.trim().length > 0 && baseUrl.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 min-w-0 text-base sm:text-sm"
          placeholder="Name, e.g. Ollama"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label="Endpoint name"
        />
        <input
          className="input flex-1 min-w-0 text-base sm:text-sm"
          placeholder="http://localhost:11434/v1"
          value={baseUrl}
          spellCheck={false}
          onChange={(event) => setBaseUrl(event.target.value)}
          aria-label="Base URL"
        />
        <button
          className="btn btn-sm"
          disabled={!canAdd}
          onClick={() => {
            addEndpoint({
              kind: 'openai-compatible',
              label: label.trim(),
              baseUrl: baseUrl.trim(),
            });
            setLabel('');
            setBaseUrl('');
            onAdded();
          }}
        >
          Add
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Works with Ollama, LM Studio, llama.cpp and vLLM. Capabilities start off and are yours to
        turn on.
      </p>
    </div>
  );
}

type ProvidersPanelProps = {
  renderSection: RenderSection;
  loadModels: () => Promise<void>;
};

export function ProvidersPanel({ renderSection, loadModels }: ProvidersPanelProps) {
  const customEndpoints = useChatStore((s) => s.customEndpoints);
  const refresh = () => {
    void loadModels();
  };

  return (
    <>
      {renderSection(
        'providers',
        'providers',
        <SettingsSection title="Model providers">
          <div className="space-y-4">
            {/* Read through the registry, not the raw constants: it is what
                carries the deployment's proxy configuration. */}
            {listEndpoints()
              .filter((endpoint) => isBuiltInEndpointId(endpoint.id))
              .map((endpoint) => (
                <div key={endpoint.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium">{endpoint.label}</div>
                    <EndpointStatus endpoint={endpoint} />
                  </div>
                  <ApiKeyField
                    keyRef={endpoint.apiKeyRef ?? endpoint.id}
                    label={`${endpoint.label} API key`}
                    placeholder={endpoint.id === 'anthropic' ? 'sk-ant-…' : 'sk-or-…'}
                    helpText={
                      endpoint.useProxy
                        ? 'This deployment supplies a key. Add your own to use it instead.'
                        : undefined
                    }
                    onChanged={refresh}
                  />
                </div>
              ))}
            <p className="text-xs text-muted-foreground">
              Keys are stored in this browser only. They are never included in an export and never
              leave the page except in a request to that provider.
            </p>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'providers',
        'endpoints',
        <SettingsSection title="Local and custom endpoints">
          <div className="space-y-3">
            {customEndpoints.map((endpoint) => (
              <CollapsibleSection
                key={endpoint.id}
                title={`${endpoint.label} — ${endpoint.baseUrl ?? 'no base URL'}`}
              >
                <CustomEndpointEditor endpoint={endpoint} onChanged={refresh} />
              </CollapsibleSection>
            ))}
            <AddEndpointForm onAdded={refresh} />
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'providers',
        'web-search',
        <SettingsSection title="Web search">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Search built into the model provider needs no extra key and is the default. Add a key
              below to use a dedicated search provider as a tool instead.
            </p>
            {listSearchProviders().map((provider) => (
              <ApiKeyField
                key={provider.id}
                keyRef={searchProviderKeyRef(provider)}
                label={`${provider.label} API key`}
                placeholder={isTavilyProxyEnabled() ? 'Provided by this deployment' : 'tvly-…'}
              />
            ))}
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
