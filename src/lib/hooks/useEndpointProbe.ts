// Module: hooks/useEndpointProbe
// Responsibility: Run the connection probe for one endpoint from the React
// tree, with one run in flight at a time and a cancel that is honoured both
// by the button and by unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { requireEndpointAuth } from '@/lib/auth/require';
import { probeEndpoint, type EndpointProbeResult, type ProbeStep } from '@/lib/openaiCompat/probe';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

export type EndpointProbeState =
  | { status: 'idle' }
  | { status: 'running'; step: ProbeStep }
  | { status: 'done'; result: EndpointProbeResult }
  | { status: 'failed'; message: string };

export function useEndpointProbe(endpoint: ProviderEndpoint): {
  state: EndpointProbeState;
  run: (modelId?: string) => void;
  cancel: () => void;
} {
  const [state, setState] = useState<EndpointProbeState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: 'idle' });
  }, []);

  const run = useCallback(
    (modelId?: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const live = () => controllerRef.current === controller && !controller.signal.aborted;

      setState({ status: 'running', step: 'models' });
      void (async () => {
        try {
          const auth = requireEndpointAuth(endpoint);
          const result = await probeEndpoint(auth, {
            modelId,
            signal: controller.signal,
            onStep: (step) => {
              if (live()) setState({ status: 'running', step });
            },
          });
          if (live()) setState({ status: 'done', result });
        } catch (error) {
          if (!live()) return;
          setState({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    },
    [endpoint],
  );

  return { state, run, cancel };
}
