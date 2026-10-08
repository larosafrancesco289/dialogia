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
  isBuiltInEndpointId,
  isValidBaseUrl,
  normalizeWorkspaceId,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { listEndpoints } from '@/lib/transport/endpointRegistry';
import type { RenderSection } from '@/components/settings/types';
import { refocusIfDropped } from '@/lib/ui/focus';
import { CONNECT_OPTIONS } from '@/components/connect/useConnectProvider';
import { useT } from '@/lib/i18n';

function EndpointStatus({ endpoint }: { endpoint: ProviderEndpoint }) {
  const t = useT();
  const { hasKey, isKeyRejected } = useProviderKeys();
  if (isKeyRejected(endpoint.apiKeyRef)) {
    return (
      <span className="text-xs" style={{ color: 'var(--color-danger)' }}>
        {t('providers.rejected')}
      </span>
    );
  }
  if (hasKey(endpoint.apiKeyRef)) {
    return <span className="text-xs text-fg-muted">{t('providers.usingKey')}</span>;
  }
  if (endpoint.kind === 'openai-compatible') {
    return (
      <span className="text-xs text-fg-muted">
        {t(allowsKeylessCalls(endpoint) ? 'providers.readyNoKey' : 'providers.needsAddress')}
      </span>
    );
  }
  return <span className="text-xs text-fg-muted">{t('providers.needsKey')}</span>;
}

// The shape of the ID, which every language writes the same way.
const WORKSPACE_ID_PLACEHOLDER = 'wrkspc_…';

/**
 * The Claude connection's workspace ID, which only a key that can act in more
 * than one workspace needs (the API's error says so). Shown once there is a
 * Claude key, so a first visit is not asked about it.
 */
function WorkspaceIdField({ keyRef, onChanged }: { keyRef: string; onChanged: () => void }) {
  const t = useT();
  const { hasKey } = useProviderKeys();
  const { workspaceId, setWorkspaceId } = useChatStore(
    (s) => ({
      workspaceId: s.anthropicWorkspaceId,
      setWorkspaceId: s.setAnthropicWorkspaceId,
    }),
    shallow,
  );
  const [invalid, setInvalid] = useState(false);
  if (!hasKey(keyRef) && !workspaceId) return null;

  return (
    <div className="space-y-2">
      <label className="field__label" htmlFor="anthropic-workspace">
        {t('providers.workspace')}
      </label>
      <input
        id="anthropic-workspace"
        className="input w-full text-base sm:text-sm"
        defaultValue={workspaceId ?? ''}
        placeholder={WORKSPACE_ID_PLACEHOLDER}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby="anthropic-workspace-hint"
        onChange={() => setInvalid(false)}
        onBlur={(event) => {
          const value = normalizeWorkspaceId(event.target.value);
          if (value === null) {
            setInvalid(true);
            return;
          }
          event.target.value = value ?? '';
          if (value === workspaceId) return;
          setWorkspaceId(value);
          onChanged();
        }}
      />
      <p id="anthropic-workspace-hint" className="field__hint" role={invalid ? 'alert' : undefined}>
        {invalid
          ? `${t('providers.workspaceInvalid')} ${t('servers.notSaved')}`
          : t('providers.workspaceHint')}
      </p>
    </div>
  );
}

function CustomEndpointEditor({
  endpoint,
  onChanged,
}: {
  endpoint: ProviderEndpoint;
  onChanged: () => void;
}) {
  const t = useT();
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
        title={t('servers.removeTitle', { name: endpoint.label })}
        description={t('servers.removeBody')}
        confirmLabel={t('attachments.remove')}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          removeEndpoint(endpoint.id);
          onChanged();
        }}
      />
      <div className="space-y-2">
        <label className="field__label" htmlFor={`base-${endpoint.id}`}>
          {t('connect.serverAddress')}
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
            ? `${t('connect.invalidAddress')} ${t('servers.notSaved')}`
            : t('servers.addressHint')}
        </p>
      </div>

      <div className="space-y-2">
        <label className="field__label" htmlFor={`models-${endpoint.id}`}>
          {t('servers.modelNames')}
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
        <p className="field__hint">{t('servers.modelNamesHint')}</p>
      </div>

      <ApiKeyField
        keyRef={endpoint.apiKeyRef ?? endpointKeyRef(endpoint.id)}
        label={t('servers.keyOptional')}
        placeholder={t('servers.keyPlaceholder')}
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
        <legend className="field__label">{t('servers.supports')}</legend>
        <p className="field__hint">{t('servers.supportsHint')}</p>
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
              {t(label)}
              <span className="block text-xs text-fg-muted">{t(hint)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label className="field__label" htmlFor={`title-${endpoint.id}`}>
          {t('servers.titles')}
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
          <option value="chat-model">{t('servers.titlesChatModel')}</option>
          <option value="off">{t('servers.titlesOff')}</option>
        </select>
      </div>

      <button className="btn-ghost btn-sm" onClick={() => setConfirmRemove(true)}>
        {t('servers.remove')}
      </button>
    </div>
  );
}

function AddEndpointForm({ onAdded }: { onAdded: () => void }) {
  const t = useT();
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
          placeholder={t('servers.namePlaceholder')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label={t('servers.name')}
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
          aria-label={t('connect.serverAddress')}
        />
        <button className="btn btn-sm" disabled={!canAdd} onClick={add}>
          {t('servers.add')}
        </button>
      </div>
      <p id="add-endpoint-hint" className="field__hint" role={urlInvalid ? 'alert' : undefined}>
        {urlInvalid ? t('connect.invalidAddress') : t('servers.addHint')}
      </p>
    </div>
  );
}

type ProvidersPanelProps = {
  renderSection: RenderSection;
  loadModels: () => Promise<void>;
};

export function ProvidersPanel({ renderSection, loadModels }: ProvidersPanelProps) {
  const t = useT();
  const customEndpoints = useChatStore((s) => s.customEndpoints);
  const refresh = () => {
    void loadModels();
  };

  return (
    <>
      {renderSection(
        'connections',
        'providers',
        <SettingsSection title={t('settings.section.providers')}>
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
                      label={t(option.name)}
                      placeholder={option.placeholder}
                      onChanged={refresh}
                    />
                    {endpoint.kind === 'anthropic' && (
                      <WorkspaceIdField
                        keyRef={endpoint.apiKeyRef ?? endpoint.id}
                        onChanged={refresh}
                      />
                    )}
                  </div>
                );
              })}
            <p className="field__hint">{t('providers.keysStay')}</p>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'connections',
        'endpoints',
        <SettingsSection title={t('settings.section.endpoints')}>
          <div className="space-y-3">
            {customEndpoints.map((endpoint) => (
              <div key={endpoint.id} data-endpoint-id={endpoint.id}>
                <CollapsibleSection
                  title={`${endpoint.label} · ${endpoint.baseUrl ?? t('servers.noAddress')}`}
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
        <SettingsSection title={t('settings.section.web-search')}>
          <div className="space-y-3">
            <p className="field__hint">{t('webSearch.hint')}</p>
            {listSearchProviders()
              .filter((provider) => !provider.usesModelKey)
              .map((provider) => (
                <ApiKeyField
                  key={provider.id}
                  keyRef={searchProviderKeyRef(provider)}
                  label={t('webSearch.keyLabel', { provider: provider.label })}
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
