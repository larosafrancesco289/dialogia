// Module: tutor agent compose
// Responsibility: the tutor's part of a turn's request: the stable prompt, the state
// block rendered from the event log, the tools the engine would accept now, and the agent loop.

import type { ModuleComposeArgs, ModuleComposeContribution } from '@/lib/modules';
import type { Message } from '@/lib/types';
import {
  learnerChangesSince,
  renderStateBlock,
  resolveTutorFlags,
  tutorToolDefinitions,
  type TutorEvent,
} from '@/modules/tutor/engine';
import { TUTOR_SYSTEM_PROMPT } from '@/modules/tutor/agent/systemPrompt';
import { currentTutorSession, tutorStore } from '@/modules/tutor/store/access';
import { EMPTY_TUTOR_SESSION } from '@/modules/tutor/store/tutorSlice';

/**
 * Where "since the learner's last message" starts: the log position the
 * previous tutor reply saw when it was composed. A chat whose replies predate
 * that bookkeeping starts after its imported history.
 */
export function learnerChangesBaseline(priorMessages: Message[], events: TutorEvent[]): number {
  for (let i = priorMessages.length - 1; i >= 0; i -= 1) {
    const message = priorMessages[i];
    if (message.role === 'assistant' && typeof message.tutorSeq === 'number') {
      return message.tutorSeq;
    }
  }
  const imported = events.find((event) => event.type === 'legacy_imported');
  return imported?.seq ?? 0;
}

export async function buildTutorComposeContribution({
  chat,
  settings,
  priorMessages,
  store,
}: ModuleComposeArgs): Promise<ModuleComposeContribution | undefined> {
  if (!settings.tutorEnabled) return undefined;

  const tutor = tutorStore(store?.get);
  const session = tutor ? await tutor.ensureTutorSession(chat.id) : EMPTY_TUTOR_SESSION;
  const { state, events } = session;
  const flags = resolveTutorFlags(chat.settings.features.tutor);
  const since = learnerChangesBaseline(priorMessages, events);

  return {
    tools: tutorToolDefinitions(state, flags),
    // The tools the engine would accept after this turn's calls so far, so
    // "start_topic, then give_quiz" can happen in one turn.
    refreshTools: () =>
      tutorToolDefinitions(currentTutorSession(store?.get, chat.id)?.state ?? state, flags),
    stablePreambles: [TUTOR_SYSTEM_PROMPT],
    dynamicPreambles: [
      renderStateBlock(state, { flags, learnerChanges: learnerChangesSince(state, events, since) }),
    ],
    loop: 'agent',
    // The tutor prompt is a complete system prompt on its own.
    replacesBaseSystem: true,
    messagePatch: { tutorSeq: state.lastSeq },
  };
}
