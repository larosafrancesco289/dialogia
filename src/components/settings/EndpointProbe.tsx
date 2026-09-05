import { useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircleIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
  XCircleIcon,
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

// Component: EndpointProbe
// Responsibility: Let the user find out what a custom endpoint accepts instead
// of guessing at the capability checkboxes, and copy the answer into them.

const STEP_LABELS: Record<ProbeStep, string> = {
  models: 'Listing models…',
  chat: 'Sending a first message…',
  tools: 'Checking tool calls…',
  parallelToolCalls: 'Checking parallel tool calls…',
  reasoning: 'Checking reasoning effort…',
  vision: 'Checking images…',
  streamUsage: 'Checking usage in stream…',
  promptCaching: 'Checking prompt caching…',
};

const VERDICT_LABELS: Record<ProbeVerdict, string> = {
  ok: 'Accepted',
  no: 'Rejected',
  unknown: 'No answer',
  skipped: 'Skipped',
};

function VerdictIcon({ verdict }: { verdict: ProbeVerdict }) {
  const className = 'h-4 w-4 shrink-0 mt-0.5';
  switch (verdict) {
    case 'ok':
      return <CheckCircleIcon className={className} style={{ color: 'var(--color-success)' }} />;
    case 'no':
      return <XCircleIcon className={className} style={{ color: 'var(--color-danger)' }} />;
    case 'unknown':
      return <QuestionMarkCircleIcon className={`${className} text-muted-foreground`} />;
    case 'skipped':
      return <MinusCircleIcon className={`${className} text-muted-foreground`} />;
  }
}

function Line({ verdict, children }: { verdict: ProbeVerdict; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <VerdictIcon verdict={verdict} />
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function Detail({ children }: { children: ReactNode }) {
  return <span className="block text-xs text-muted-foreground break-words">{children}</span>;
}

function ServerLine({ result, baseUrl }: { result: EndpointProbeResult; baseUrl: string }) {
  const { models } = result;
  switch (models.verdict) {
    case 'ok': {
      const count = models.ids.length;
      return (
        <Line verdict="ok">
          Reachable.{' '}
          {count === 0
            ? 'It lists no models, so only the ids you typed are used.'
            : `It lists ${count} model${count === 1 ? '' : 's'}.`}
        </Line>
      );
    }
    case 'no-route':
      return (
        <Line verdict="ok">
          Reachable. <Detail>No /models route here, so only the ids you typed are used.</Detail>
        </Line>
      );
    case 'unauthorized':
      return (
        <Line verdict="no">
          Reachable, but it wants a key it did not accept. <Detail>{models.detail}</Detail>
        </Line>
      );
    case 'unreachable': {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'this page';
      return (
        <Line verdict="no">
          Could not reach {baseUrl}.
          <Detail>
            {models.detail} Check that the server is running and that it allows requests from{' '}
            {origin}. Ollama needs OLLAMA_ORIGINS to include that origin, and LM Studio needs CORS
            enabled in its server settings.
          </Detail>
        </Line>
      );
    }
    case 'failed':
      return (
        <Line verdict="no">
          Reachable, but listing models failed. <Detail>{models.detail}</Detail>
        </Line>
      );
  }
}

function ChatLine({ result }: { result: EndpointProbeResult }) {
  const { chat, modelId } = result;
  if (chat.verdict === 'ok') {
    const seconds = ((chat.latencyMs ?? 0) / 1000).toFixed(1);
    return (
      <Line verdict="ok">
        {modelId} replied in {seconds} s.
      </Line>
    );
  }
  if (chat.verdict === 'no') {
    return (
      <Line verdict="no">
        {modelId} did not answer. <Detail>{chat.detail}</Detail>
      </Line>
    );
  }
  return (
    <Line verdict={chat.verdict}>
      {modelId ? `${modelId} was not tested.` : 'No message was sent.'}
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
  const current = endpointCapabilities(endpoint);
  const detected = detectedCapabilities(result, current);
  const differs = CAPABILITY_LABELS.some(({ key }) => detected[key] !== current[key]);
  const checked = result.chat.verdict === 'ok';

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius-editorial)] border border-[var(--color-border)] p-3 space-y-2"
    >
      <ServerLine result={result} baseUrl={endpoint.baseUrl ?? ''} />
      <ChatLine result={result} />
      {checked ? (
        <ul className="space-y-1 border-t border-[var(--color-border)] pt-2">
          {CAPABILITY_LABELS.map(({ key, label }) => {
            const check = result.capabilities[key];
            return (
              <li key={key}>
                <Line verdict={check.verdict}>
                  {label}
                  <span className="text-muted-foreground"> · {VERDICT_LABELS[check.verdict]}</span>
                  {check.detail ? <Detail>{check.detail}</Detail> : null}
                </Line>
              </li>
            );
          })}
        </ul>
      ) : null}
      {checked ? (
        differs ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="btn btn-sm" onClick={() => onApply(detected)}>
              Apply to the checkboxes below
            </button>
            <span className="text-xs text-muted-foreground">
              Turns on what was accepted and off what was rejected.
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            The checkboxes below already match what this server accepted.
          </p>
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
      <div className="text-sm">Test the connection</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={running ? 'btn-outline btn-sm' : 'btn btn-sm'}
          onClick={() => (running ? cancel() : run(modelId))}
        >
          {running ? 'Cancel' : state.status === 'done' ? 'Test again' : 'Test connection'}
        </button>
        {candidates.length > 1 ? (
          <select
            className="input flex-1 min-w-0 text-base sm:text-sm"
            aria-label="Model to test with"
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
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {STEP_LABELS[state.step]}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Sends a handful of one-token requests
        {modelId ? ` to ${modelId}` : ''} to see which fields this server accepts, so the checkboxes
        below can be set from an answer instead of a guess.
      </p>
      {state.status === 'done' ? (
        <ProbeReport endpoint={endpoint} result={state.result} onApply={onApply} />
      ) : null}
      {state.status === 'failed' ? (
        <p className="text-xs" role="alert" style={{ color: 'var(--color-danger)' }}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
