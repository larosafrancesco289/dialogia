// Module: tutor agent compose
// Responsibility: the tutor's part of a turn's request: the stable prompt, the state
// block rendered from the event log, the tools the engine would accept now, and the agent loop.

import type { ModuleComposeArgs, ModuleComposeContribution } from '@/lib/modules';
import { memoryOnInChat } from '@/lib/memory/notebook';
import type { Message } from '@/lib/types';
import {
  learnerChangesSince,
  renderStateBlock,
  resolveTutorFlags,
  tutorToolDefinitions,
  type TutorEvent,
} from '@/modules/tutor/engine';
import { TUTOR_SYSTEM_PROMPT, tutorLanguagePrompt } from '@/modules/tutor/agent/systemPrompt';
import { appLanguageForModel } from '@/lib/i18n/state';
import { tutorLearningRecords } from '@/modules/tutor/lib/learningRecords';
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
  ui,
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
  // Until this chat has a plan, and while it has memory, the tutor sees what the
  // learner studied in their other tutor chats.
  const otherChats =
    tutor && store && !state.plan && memoryOnInChat(ui, chat)
      ? await tutorLearningRecords(
          store.get().chats.filter((other) => other.id !== chat.id),
          tutor.ensureTutorSession,
        )
      : [];

  const language = tutorLanguagePrompt(appLanguageForModel());
  const lastExchangeAt = priorMessages.reduce<number | undefined>(
    (latest, message) => Math.max(latest ?? 0, message.createdAt),
    undefined,
  );

  return {
    tools: tutorToolDefinitions(state, flags),
    // The tools the engine would accept after this turn's calls so far, so
    // "start_topic, then give_quiz" can happen in one turn.
    refreshTools: () =>
      tutorToolDefinitions(currentTutorSession(store?.get, chat.id)?.state ?? state, flags),
    stablePreambles: language ? [TUTOR_SYSTEM_PROMPT, language] : [TUTOR_SYSTEM_PROMPT],
    dynamicPreambles: [
      renderStateBlock(state, {
        flags,
        now: Date.now(),
        ...(lastExchangeAt != null ? { lastExchangeAt } : {}),
        learnerChanges: learnerChangesSince(state, events, since),
        otherChats,
        since,
      }),
    ],
    loop: 'agent',
    // The tutor prompt is a complete system prompt on its own.
    replacesBaseSystem: true,
    messagePatch: { tutorSeq: state.lastSeq },
  };
}
