import { useMemo, useState, type ReactNode } from 'react';
import {
  CheckIcon,
  MinusIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CAPABILITY_LABELS } from '@/components/settings/endpointCapabilityLabels';
import { useChatStore } from '@/lib/store';
import { useEndpointProbe } from '@/lib/hooks/useEndpointProbe';
import {
  detectedCapabilities,
  type EndpointProbeResult,
  type ProbeStep,
  type ProbeVerdict,
} from '@/lib/openaiCompat/probe';
import {
  endpointCapabilities,
  type EndpointCapabilities,
  type ProviderEndpoint,
} from '@/lib/transport/endpoints';
import { useT, type MessageKey } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n/format';

// Component: EndpointProbe
// Responsibility: Let the user find out what a custom endpoint accepts instead
// of guessing at the capability checkboxes, and copy the answer into them.

const STEP_LABELS: Record<ProbeStep, MessageKey> = {
  models: 'probe.step.models',
  chat: 'probe.step.chat',
  tools: 'probe.step.tools',
  parallelToolCalls: 'probe.step.parallelToolCalls',
  reasoning: 'probe.step.reasoning',
  vision: 'probe.step.vision',
  streamUsage: 'probe.step.streamUsage',
  promptCaching: 'probe.step.promptCaching',
};

const VERDICT_LABELS: Record<ProbeVerdict, MessageKey> = {
  ok: 'probe.verdict.ok',
  no: 'probe.verdict.no',
  unknown: 'probe.verdict.unknown',
  skipped: 'probe.verdict.skipped',
};

// Accepted in ink, rejected in crimson, the rest muted: the chrome has no green.
function VerdictIcon({ verdict }: { verdict: ProbeVerdict }) {
  switch (verdict) {
    case 'ok':
      return <CheckIcon className="endpoint-probe__icon is-ok" aria-hidden="true" />;
    case 'no':
      return <XMarkIcon className="endpoint-probe__icon is-no" aria-hidden="true" />;
    case 'unknown':
      return <QuestionMarkCircleIcon className="endpoint-probe__icon" aria-hidden="true" />;
    case 'skipped':
      return <MinusIcon className="endpoint-probe__icon" aria-hidden="true" />;
  }
}

function Line({ verdict, children }: { verdict: ProbeVerdict; children: ReactNode }) {
  return (
    <div className="endpoint-probe__line">
      <VerdictIcon verdict={verdict} />
      <div>{children}</div>
    </div>
  );
}

function Detail({ children }: { children: ReactNode }) {
  return <span className="field__hint block break-words">{children}</span>;
}

function ServerLine({ result, baseUrl }: { result: EndpointProbeResult; baseUrl: string }) {
  const t = useT();
  const { models } = result;
  switch (models.verdict) {
    case 'ok': {
      const count = models.ids.length;
      return (
        <Line verdict="ok">
          {t('probe.reachable')}{' '}
          {count === 0 ? t('probe.noModels') : t('probe.listsModels', { count })}
        </Line>
      );
    }
    case 'not-api':
      return (
        <Line verdict="no">
          {t('probe.notApi', { address: baseUrl })}
          <Detail>{t('probe.notApiHint')}</Detail>
        </Line>
      );
    case 'no-route':
      return (
        <Line verdict="ok">
          {t('probe.reachable')} <Detail>{t('probe.noRoute')}</Detail>
        </Line>
      );
    case 'unauthorized':
      return (
        <Line verdict="no">
          {t('probe.unauthorized')} <Detail>{models.detail}</Detail>
        </Line>
      );
    case 'unreachable': {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return (
        <Line verdict="no">
          {t('probe.unreachable', { address: baseUrl })}
          <Detail>
            {models.detail ? `${models.detail} ` : ''}
            {t('probe.unreachableHint', { origin })}
          </Detail>
        </Line>
      );
    }
    case 'failed':
      return (
        <Line verdict="no">
          {t('probe.listFailed')} <Detail>{models.detail}</Detail>
        </Line>
      );
  }
}

function ChatLine({ result }: { result: EndpointProbeResult }) {
  const t = useT();
  const { chat, modelId } = result;
  if (chat.verdict === 'ok') {
    const seconds = formatNumber((chat.latencyMs ?? 0) / 1000, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'short',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return <Line verdict="ok">{t('probe.replied', { model: modelId ?? '', time: seconds })}</Line>;
  }
  if (chat.verdict === 'no') {
    return (
      <Line verdict="no">
        {t('probe.noAnswer', { model: modelId ?? '' })} <Detail>{chat.detail}</Detail>
      </Line>
    );
  }
  return (
    <Line verdict={chat.verdict}>
      {modelId ? t('probe.notTested', { model: modelId }) : t('probe.noMessage')}
      {chat.detail ? <Detail>{chat.detail}</Detail> : null}
    </Line>
  );
}

function ProbeReport({
  endpoint,
  result,
  onApply,
}: {
  endpoint: ProviderEndpoint;
  result: EndpointProbeResult;
  onApply: (capabilities: Required<EndpointCapabilities>) => void;
}) {
  const t = useT();
  const current = endpointCapabilities(endpoint);
  const detected = detectedCapabilities(result, current);
  const differs = CAPABILITY_LABELS.some(({ key }) => detected[key] !== current[key]);
  const checked = result.chat.verdict === 'ok';

  return (
    <div role="status" aria-live="polite" className="endpoint-probe__report">
      <ServerLine result={result} baseUrl={endpoint.baseUrl ?? ''} />
      {/* A server that could not be reached, or is not one, was sent nothing;
          the line above says so. */}
      {result.models.verdict !== 'unreachable' && result.models.verdict !== 'not-api' && (
        <ChatLine result={result} />
      )}
      {checked ? (
        <ul className="endpoint-probe__checks">
          {CAPABILITY_LABELS.map(({ key, label }) => {
            const check = result.capabilities[key];
            return (
              <li key={key}>
                <Line verdict={check.verdict}>
                  {t(label)}
                  <span className="endpoint-probe__verdict">
                    {' '}
                    · {t(VERDICT_LABELS[check.verdict])}
                  </span>
                  {check.detail ? <Detail>{check.detail}</Detail> : null}
                </Line>
              </li>
            );
          })}
        </ul>
      ) : null}
      {checked ? (
        differs ? (
          <div className="endpoint-probe__apply">
            <button type="button" className="btn btn-sm" onClick={() => onApply(detected)}>
              {t('probe.apply')}
            </button>
            <span className="field__hint">{t('probe.applyHint')}</span>
          </div>
        ) : (
          <p className="field__hint">{t('probe.alreadyMatch')}</p>
        )
      ) : null}
    </div>
  );
}

export function EndpointProbe({
  endpoint,
  onApply,
}: {
  endpoint: ProviderEndpoint;
  onApply: (capabilities: Required<EndpointCapabilities>) => void;
}) {
  const t = useT();
  const { state, run, cancel } = useEndpointProbe(endpoint);
  const models = useChatStore((s) => s.models);
  const [chosenModelId, setChosenModelId] = useState<string>();

  const candidates = useMemo(() => {
    const ids = new Set<string>(endpoint.modelIds ?? []);
    for (const model of models) {
      if (model.endpointId === endpoint.id && model.transportModelId) {
        ids.add(model.transportModelId);
      }
    }
    return Array.from(ids);
  }, [endpoint.id, endpoint.modelIds, models]);

  const modelId =
    chosenModelId && candidates.includes(chosenModelId) ? chosenModelId : candidates[0];
  const running = state.status === 'running';

  return (
    <div className="space-y-2">
      <div className="field__label">{t('probe.title')}</div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Gold only until there is an answer: after that, applying it is the
            go-ahead and testing again is the secondary action. */}
        <button
          type="button"
          className={running || state.status === 'done' ? 'btn-outline btn-sm' : 'btn btn-sm'}
          onClick={() => (running ? cancel() : run(modelId))}
        >
          {t(
            running ? 'common.cancel' : state.status === 'done' ? 'probe.testAgain' : 'probe.test',
          )}
        </button>
        {candidates.length > 1 ? (
          <select
            className="input flex-1 min-w-0 text-base sm:text-sm"
            aria-label={t('probe.modelToTest')}
            value={modelId}
            disabled={running}
            onChange={(event) => setChosenModelId(event.target.value)}
          >
            {candidates.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : null}
        {running ? (
          <span className="field__hint" role="status" aria-live="polite">
            {t(STEP_LABELS[state.step])}
          </span>
        ) : null}
      </div>
      <p className="field__hint">
        {modelId ? t('probe.hintModel', { model: modelId }) : t('probe.hint')}
      </p>
      {state.status === 'done' ? (
        <ProbeReport endpoint={endpoint} result={state.result} onApply={onApply} />
      ) : null}
      {state.status === 'failed' ? (
        <p className="endpoint-probe__error" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
