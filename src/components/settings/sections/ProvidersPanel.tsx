import { useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EndpointProbe } from '@/components/settings/EndpointProbe';
import { CAPABILITY_LABELS } from '@/components/settings/endpointCapabilityLabels';
import { useChatStore } from '@/lib/store';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';
import { listSearchProviders, searchProviderKeyRef } from '@/lib/search/providers';
import {
  allowsKeylessCalls,
  endpointCapabilities,
  endpointKeyRef,
  INVALID_BASE_URL_MESSAGE,
  isBuiltInEndpointId,
  isValidBaseUrl,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { listEndpoints } from '@/lib/transport/endpointRegistry';
import type { RenderSection } from '@/components/settings/types';
import { refocusIfDropped } from '@/lib/ui/focus';
import { CONNECT_OPTIONS } from '@/components/connect/useConnectProvider';

function EndpointStatus({ endpoint }: { endpoint: ProviderEndpoint }) {
  const { hasKey, isKeyRejected } = useProviderKeys();
  if (isKeyRejected(endpoint.apiKeyRef)) {
    return (
      <span className="text-xs" style={{ color: 'var(--color-danger)' }}>
        The provider rejected this key. Paste a new one.
      </span>
    );
  }
  if (hasKey(endpoint.apiKeyRef)) {
    return <span className="text-xs text-fg-muted">Using your key</span>;
  }
  if (endpoint.kind === 'openai-compatible') {
    return (
      <span className="text-xs text-fg-muted">
        {allowsKeylessCalls(endpoint) ? 'Ready (no key needed)' : 'Needs an address'}
      </span>
    );
  }
  return <span className="text-xs text-fg-muted">Needs a key</span>;
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [urlInvalid, setUrlInvalid] = useState(false);

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${endpoint.label}?`}
        description="Its address, key and settings go. Chats that used its models keep their messages."
        confirmLabel="Remove"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          removeEndpoint(endpoint.id);
          onChanged();
        }}
      />
      <div className="space-y-2">
        <label className="field__label" htmlFor={`base-${endpoint.id}`}>
          Server address
        </label>
        <input
          id={`base-${endpoint.id}`}
          className="input w-full text-base sm:text-sm"
          defaultValue={endpoint.baseUrl ?? ''}
          type="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={urlInvalid || undefined}
          aria-describedby={`base-${endpoint.id}-hint`}
          onChange={() => setUrlInvalid(false)}
          onBlur={(event) => {
            // A server needs an address: an emptied field goes back to the one
            // it has, rather than showing blank over a URL still in use.
            if (!event.target.value.trim()) {
              event.target.value = endpoint.baseUrl ?? '';
              return;
            }
            if (!isValidBaseUrl(event.target.value)) {
              setUrlInvalid(true);
              return;
            }
            updateEndpoint(endpoint.id, { baseUrl: event.target.value.trim() });
            onChanged();
          }}
        />
        <p
          id={`base-${endpoint.id}-hint`}
          className="field__hint"
          role={urlInvalid ? 'alert' : undefined}
        >
          {urlInvalid
            ? `${INVALID_BASE_URL_MESSAGE} Not saved.`
            : "The server's address, e.g. http://localhost:11434/v1 for Ollama."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="field__label" htmlFor={`models-${endpoint.id}`}>
          Model names
        </label>
        <input
          id={`models-${endpoint.id}`}
          className="input w-full text-base sm:text-sm"
          defaultValue={(endpoint.modelIds ?? []).join(', ')}
          spellCheck={false}
          placeholder="qwen3:8b, llama3.2"
          onBlur={(event) => {
            const modelIds = event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean);
            // Show the list as it was saved.
            event.target.value = modelIds.join(', ');
            updateEndpoint(endpoint.id, { modelIds });
            onChanged();
          }}
        />
        <p className="field__hint">
          Comma-separated. Whatever this server lists at /models is added automatically.
        </p>
      </div>

      <ApiKeyField
        keyRef={endpoint.apiKeyRef ?? endpointKeyRef(endpoint.id)}
        label="Key (optional)"
        placeholder="Most local servers need none"
        onChanged={onChanged}
      />

      <EndpointProbe
        endpoint={endpoint}
        onApply={(capabilities) => {
          updateEndpoint(endpoint.id, { capabilities });
          onChanged();
        }}
      />

      <fieldset className="space-y-2">
        <legend className="field__label">What this server supports</legend>
        <p className="field__hint">
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
              <span className="block text-xs text-fg-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label className="field__label" htmlFor={`title-${endpoint.id}`}>
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

      <button className="btn-ghost btn-sm" onClick={() => setConfirmRemove(true)}>
        Remove this server
      </button>
    </div>
  );
}

function AddEndpointForm({ onAdded }: { onAdded: () => void }) {
  const addEndpoint = useChatStore((s) => s.addEndpoint);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [urlInvalid, setUrlInvalid] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  const canAdd = label.trim().length > 0 && baseUrl.trim().length > 0;

  const add = () => {
    if (!canAdd) return;
    // Saved even when nothing answers there yet; only a non-address is refused.
    if (!isValidBaseUrl(baseUrl)) {
      setUrlInvalid(true);
      return;
    }
    const endpoint = addEndpoint({
      kind: 'openai-compatible',
      label: label.trim(),
      baseUrl: baseUrl.trim(),
    });
    setLabel('');
    setBaseUrl('');
    onAdded();
    // Add disables itself once the fields empty, which would drop focus on the
    // page: the new server's row takes it, else the name field for another.
    refocusIfDropped(
      () =>
        document.querySelector(
          `[data-endpoint-id="${CSS.escape(endpoint.id)}"] .collapsible-section-trigger`,
        ),
      () => nameRef.current,
    );
  };

  return (
    <div className="space-y-3">
      {/* With the keyboard up, the fields come into view with their button. */}
      <div className="flex flex-wrap gap-2" data-keyboard-reveal="">
        <input
          ref={nameRef}
          className="input flex-1 basis-full sm:basis-0 min-w-0 text-base sm:text-sm"
          placeholder="Name, e.g. Ollama"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label="Server name"
        />
        <input
          className="input flex-1 basis-full sm:basis-0 min-w-0 text-base sm:text-sm"
          placeholder={CONNECT_OPTIONS.local.placeholder}
          value={baseUrl}
          // A phone's URL keyboard, which does not capitalise the first letter.
          type="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={urlInvalid || undefined}
          aria-describedby="add-endpoint-hint"
          onChange={(event) => {
            setBaseUrl(event.target.value);
            setUrlInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          aria-label="Server address"
        />
        <button className="btn btn-sm" disabled={!canAdd} onClick={add}>
          Add
        </button>
      </div>
      <p id="add-endpoint-hint" className="field__hint" role={urlInvalid ? 'alert' : undefined}>
        {urlInvalid
          ? INVALID_BASE_URL_MESSAGE
          : 'Works with Ollama, LM Studio, llama.cpp and vLLM. Capabilities start off and are yours to turn on.'}
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
        'connections',
        'providers',
        <SettingsSection title="Providers">
          <div className="space-y-4">
            {/* Read through the registry, not the raw constants: it is what
                carries the user's own endpoints. */}
            {listEndpoints()
              .filter((endpoint) => isBuiltInEndpointId(endpoint.id))
              .map((endpoint) => {
                const option =
                  CONNECT_OPTIONS[endpoint.id === 'anthropic' ? 'anthropic' : 'openrouter'];
                return (
                  <div key={endpoint.id} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium">{endpoint.label}</div>
                      <EndpointStatus endpoint={endpoint} />
                    </div>
                    <ApiKeyField
                      keyRef={endpoint.apiKeyRef ?? endpoint.id}
                      label={option.name}
                      placeholder={option.placeholder}
                      onChanged={refresh}
                    />
                  </div>
                );
              })}
            <p className="field__hint">Keys stay in this browser and are never exported.</p>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'connections',
        'endpoints',
        <SettingsSection title="Your servers">
          <div className="space-y-3">
            {customEndpoints.map((endpoint) => (
              <div key={endpoint.id} data-endpoint-id={endpoint.id}>
                <CollapsibleSection
                  title={`${endpoint.label} · ${endpoint.baseUrl ?? 'no address'}`}
                >
                  <CustomEndpointEditor endpoint={endpoint} onChanged={refresh} />
                </CollapsibleSection>
              </div>
            ))}
            <AddEndpointForm onAdded={refresh} />
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'connections',
        'web-search',
        <SettingsSection title="Web search">
          <div className="space-y-3">
            <p className="field__hint">
              Search built into the model provider needs no extra key and is the default. With an
              OpenRouter key you can also pick OpenRouter search in the composer: the model searches
              when it needs to, on your OpenRouter credit, and pages are read through Jina Reader.
              Your searches go to OpenRouter&apos;s search partner, and page addresses to Jina.
            </p>
            {listSearchProviders()
              .filter((provider) => !provider.usesModelKey)
              .map((provider) => (
                <ApiKeyField
                  key={provider.id}
                  keyRef={searchProviderKeyRef(provider)}
                  label={`${provider.label} key`}
                  placeholder="tvly-…"
                  onChanged={refresh}
                />
              ))}
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
