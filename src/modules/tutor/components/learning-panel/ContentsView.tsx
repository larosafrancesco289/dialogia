import { useEffect, useState } from 'react';
import type { LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import { isMeasured, nextReadyNode, type TopicExplanation } from '@/modules/tutor/engine';
import type { TutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { readableNote } from '@/modules/tutor/ui/messageViews';
import { listInProse } from '@/lib/utils/text';
import { Meter, PathStep, stepState, waitingOn, type StepState } from './PlanPath';
import { pct, shownPercent, statusWords } from '@/modules/tutor/lib/topicStatus';
import { Markdown } from '@/components/Markdown';
import { asTheirIdea } from '@/modules/tutor/lib/text';
import { CarriedOverWords } from '@/modules/tutor/components/message/CarriedOverWords';

// Corrections are recorded for the tutor ("Learner said…"); read them back
// to the learner in the second person.

type Explain = (nodeId: string) => TopicExplanation | undefined;

export type ContentsCorrections = {
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<unknown>;
  onResolveMisconception: (nodeId: string, misconceptionId: string) => Promise<unknown>;
};

/**
 * The Learning Hub at rest: the plan as a path, and the learner model on it.
 * Every topic says where it stands in words, and every started topic or one
 * with evidence shows the tutor's estimate as a number. Opening a topic says what it
 * covers, why the estimate is what it is and, where the learner may, how to
 * correct it. Changing the plan lives in Edit plan.
 */
export function ContentsView({
  plan,
  mastery,
  explain,
  affordances,
  corrections,
}: {
  plan: LearningPlan;
  mastery?: Record<string, TopicMastery>;
  /** "Why N%": the engine's replay of the session's evidence for a topic. */
  explain: Explain;
  affordances: TutorAffordances;
  corrections: ContentsCorrections;
}) {
  const currentId = plan.nodes.find((n) => n.status === 'in_progress')?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(currentId);
  // When the plan moves on, the open topic follows it.
  useEffect(() => setOpenId(currentId), [currentId]);

  const done = plan.nodes.filter((n) => n.status === 'completed').length;
  const upNextId = nextReadyNode(plan)?.id;
  const hours = plan.metadata?.estimatedHours;
  const anyShown = plan.nodes.some(
    (n) => shownPercent(stepState(plan, n), mastery?.[n.id]) != null,
  );

  return (
    <div className="hub-contents">
      <div className="hub-contents__intro">
        {plan.goal && (
          <>
            <p className="hub-label">Your goal</p>
            <p className="hub-contents__goal">
              <Markdown inline content={plan.goal} />
            </p>
          </>
        )}
        <p className="hub-contents__meta">
          {done} of {plan.nodes.length} {plan.nodes.length === 1 ? 'topic' : 'topics'} done
          {hours != null ? ` · about ${hours} ${hours === 1 ? 'hour' : 'hours'} in all` : ''}
        </p>
      </div>

      <ol className="hub-path">
        {plan.nodes.map((node, index) => (
          <ContentsItem
            key={node.id}
            node={node}
            number={index + 1}
            state={stepState(plan, node)}
            upNext={node.id === upNextId}
            waiting={waitingOn(plan, node)}
            mastery={mastery?.[node.id]}
            explain={explain}
            affordances={affordances}
            corrections={corrections}
            open={openId === node.id}
            onToggle={() => setOpenId((prev) => (prev === node.id ? null : node.id))}
          />
        ))}
      </ol>

      {affordances.showMastery && anyShown && (
        <p className="hub-contents__hint">
          Each percentage is the tutor’s estimate of how well you know that topic. Open a topic to
          see why{affordances.correctMastery ? ', or to correct it' : ''}.
        </p>
      )}
    </div>
  );
}

function ContentsItem({
  node,
  number,
  state,
  upNext,
  waiting,
  mastery,
  explain,
  affordances,
  corrections,
  open,
  onToggle,
}: {
  node: LearningPlanNode;
  number: number;
  state: StepState;
  upNext: boolean;
  waiting: string[];
  mastery?: TopicMastery;
  explain: Explain;
  affordances: TutorAffordances;
  corrections: ContentsCorrections;
  open: boolean;
  onToggle: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const measured = isMeasured(mastery);
  const percent = affordances.showMastery ? shownPercent(state, mastery) : undefined;
  const showMastery = percent != null;
  const openMisconceptions = affordances.showMastery
    ? (mastery?.misconceptions?.filter((m) => !m.resolved) ?? [])
    : [];
  const toClear = openMisconceptions.length;
  const explanation = open && showMastery ? explain(node.id) : undefined;
  // The learner's own correction is the latest word on this topic: say what
  // they told the tutor, rather than offer the same two buttons again.
  const saidFelt = feltBy(mastery, explanation);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PathStep
      state={state}
      number={number}
      className={`${measured ? '' : 'is-untouched'}${open ? ' is-open' : ''}`}
    >
      <button type="button" className="hub-path__row" aria-expanded={open} onClick={onToggle}>
        <span className="hub-path__name">
          <Markdown inline content={node.name} />
        </span>
        {showMastery && <span className="hub-path__pct">{percent}%</span>}
        <span className="hub-path__sub">
          {showMastery && <Meter value={mastery!.confidence} />}
          <span className="hub-path__status">
            <Markdown inline content={statusWords(state, upNext, waiting)} />
            {toClear > 0 && (
              <>
                {' · '}
                <span className="hub-path__warn">
                  {toClear === 1 ? '1 thing to clear up' : `${toClear} things to clear up`}
                </span>
              </>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="hub-topic">
          {node.description && (
            <p className="hub-topic__desc">
              <Markdown inline content={node.description} />
            </p>
          )}
          {node.objectives.length > 0 && (
            <div>
              <p className="hub-label">You’ll be able to</p>
              <ul className="hub-topic__objectives">
                {node.objectives.map((objective, i) => (
                  <li key={i}>
                    <Markdown inline content={objective} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showMastery && <Why mastery={mastery!} explanation={explanation} />}

          {showMastery && affordances.correctMastery && saidFelt && (
            // The list above already says what they told the tutor; this says what comes next.
            <p className="hub-topic__note">Noted. Your next answers will settle it.</p>
          )}
          {showMastery && affordances.correctMastery && !saidFelt && (
            <div className="hub-topic__correct">
              <span>Seems wrong?</span>
              {/* The pair wraps as one: never "Too high" on a line and "Too low" alone below. */}
              <span className="estimate-choices" role="group" aria-label="Correct the estimate">
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void act(() => corrections.onContestMastery(node.id, 'down'))}
                >
                  Too high
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void act(() => corrections.onContestMastery(node.id, 'up'))}
                >
                  Too low
                </button>
              </span>
            </div>
          )}

          {openMisconceptions.map((m) => (
            <div key={m.id} className="hub-clear">
              <p className="hub-label">To clear up</p>
              <p className="hub-clear__text">
                <Markdown inline content={asTheirIdea(m.description)} />
              </p>
              {affordances.correctMastery && (
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void act(() => corrections.onResolveMisconception(node.id, m.id))}
                >
                  I’ve got this now
                </button>
              )}
            </div>
          ))}

          {state === 'locked' && waiting.length > 0 && (
            <p className="hub-topic__note">
              <Markdown inline content={`Starts once you’ve finished ${listInProse(waiting)}.`} />
            </p>
          )}
        </div>
      )}
    </PathStep>
  );
}

type WhyStep = TopicExplanation['steps'][number] & { evidence?: TopicMastery['evidence'][number] };

/** "high" or "low" when the topic's latest evidence is the learner saying its estimate felt off. */
function feltBy(
  mastery: TopicMastery | undefined,
  explanation: TopicExplanation | undefined,
): 'high' | 'low' | null {
  const last = mastery?.evidence.at(-1);
  if (last?.source !== 'learner' || last.kind !== 'adjusted') return null;
  const step = explanation?.steps.at(-1);
  if (!step) return null;
  return step.after < step.before ? 'high' : 'low';
}

// A step that placed the estimate rather than moving it.
const isSetting = (evidence: WhyStep['evidence']) =>
  !evidence || (typeof evidence.setTo === 'number' && evidence.kind !== 'misconception');

/** What placed the estimate directly, in the learner's words. */
function settingLabel(evidence: WhyStep['evidence']): string {
  if (evidence?.kind === 'placement') return 'Starting estimate';
  if (evidence?.kind === 'more_practice') return 'You asked for more practice';
  if (evidence?.kind === 'marked_known') return 'You marked it as known';
  if (evidence?.source === 'learner') return 'You corrected it';
  if (evidence?.source === 'learner_said') return 'You told the tutor';
  return 'Set by the tutor';
}

/**
 * One line of "Why N%": what moved the estimate, as a signed change and a sentence
 * ("+7  You answered a quiz question correctly"). Only the first line, where the
 * estimate starts, is a figure.
 */
function WhyLine({
  step: { evidence, before, after },
  first,
  topic,
}: {
  step: WhyStep;
  first: boolean;
  topic: string;
}) {
  const setting = isSetting(evidence);
  const details = evidence?.details ? readableNote(evidence.details) : '';
  // The learner's own correction is its own sentence ("You said the estimate
  // felt too high."), as is where a carried-over estimate came from; other
  // settings are named, with their reason under.
  const own = evidence?.source === 'learner' && evidence.kind === 'adjusted' && !!details;
  const carried = evidence?.carriedOver;
  const delta = pct(after) - pct(before);
  const figure = first
    ? `${pct(after)}%`
    : delta > 0
      ? `+${delta}`
      : delta < 0
        ? `−${-delta}`
        : '0';
  const tone = first ? '' : delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '';
  return (
    <li className={first ? 'is-edge' : undefined}>
      <span className={`hub-why__figure${tone}`}>{figure}</span>
      <span>
        {!setting || own ? (
          <Markdown inline content={details} />
        ) : carried ? (
          <CarriedOverWords carried={carried} setTo={after} topic={topic} />
        ) : (
          <>
            {settingLabel(evidence)}
            {details && (
              <span className="hub-why__note">
                <Markdown inline content={details} />
              </span>
            )}
          </>
        )}
      </span>
    </li>
  );
}

/**
 * "Why N%": the whole story, oldest first: where the estimate started, each
 * change, and where it stands now. A direct setting (a correction, more
 * practice) reads as the change it made, like any other line.
 */
function Why({ mastery, explanation }: { mastery: TopicMastery; explanation?: TopicExplanation }) {
  const start = explanation?.start ?? mastery.confidence;
  const steps: WhyStep[] = (explanation?.steps ?? []).map((step) => ({
    ...step,
    evidence: mastery.evidence.find((entry) => entry.eventId === step.eventId),
  }));
  // A starting estimate set by the plan is the start: no prior line above it.
  const opensWithSetting = steps.length > 0 && isSetting(steps[0].evidence);
  // With nothing since the start, the start line already states today's value.
  const startIsNow = steps.length === (opensWithSetting ? 1 : 0);

  return (
    <div className="hub-why">
      <p className="hub-label">Why {pct(mastery.confidence)}%</p>
      <ol className="hub-why__list">
        {!opensWithSetting && (
          <li className="is-edge">
            <span className="hub-why__figure">{pct(start)}%</span>
            <span>
              {mastery.baseline != null ? 'Carried over from before' : 'Starting estimate'}
            </span>
          </li>
        )}
        {steps.map((step, i) => (
          <WhyLine
            key={i}
            step={step}
            first={i === 0 && opensWithSetting}
            topic={explanation?.name ?? mastery.nodeId}
          />
        ))}
        {!startIsNow && (
          <li className="is-now">
            <span className="hub-why__figure">{pct(mastery.confidence)}%</span>
            <span>Now</span>
          </li>
        )}
      </ol>
    </div>
  );
}
