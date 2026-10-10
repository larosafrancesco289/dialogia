import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import {
  findModelById,
  formatModelLabel,
  isToolCallingSupported,
  resolveTutorModelId,
} from '@/lib/models';
import { selectCurrentChat } from '@/lib/store/selectors';
import { findModelEndpoint } from '@/lib/transport/endpointRegistry';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

export type TutorModel = {
  id?: string;
  label: string;
  /** False only once the model list says so: a tutor turn on it runs without the tutor's tools. */
  canUseTools: boolean;
  endpoint?: ProviderEndpoint;
};

/**
 * The model a tutor turn in the open chat will use: the chosen one when it is
 * on offer, else the one the turn falls back to, so the header never names a
 * model nobody serves. Its tools are what plans and quizzes are made of.
 */
export function useTutorModel(): TutorModel {
  const { chat, models, tutorDefaultModelId } = useChatStore(
    (s) => ({
      chat: selectCurrentChat(s),
      models: s.models,
      tutorDefaultModelId: s.ui.tutor?.defaultModelId,
    }),
    shallow,
  );
  // The registry lives outside React: a server's capabilities changed in
  // Settings are read again with the endpoint list.
  const customEndpoints = useChatStore((s) => s.customEndpoints);
  const chosen =
    chat?.settings?.features.tutor?.defaultModelId ||
    chat?.settings?.modelId ||
    tutorDefaultModelId;
  return useMemo(() => {
    const id = chosen && models.length > 0 ? resolveTutorModelId(chosen, models) : chosen;
    const meta = findModelById(models, id);
    return {
      id,
      label: id ? formatModelLabel({ model: meta, fallbackId: id }) : '',
      canUseTools: !meta || isToolCallingSupported(meta),
      endpoint: id ? findModelEndpoint(id, meta) : undefined,
    };
    // customEndpoints: the endpoint is read from the registry it republishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, models, customEndpoints]);
}
