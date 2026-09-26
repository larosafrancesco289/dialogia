import { useEffect, useState } from 'react';
import type { LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import { nextReadyNode, type TopicExplanation } from '@/modules/tutor/engine';
import type { TutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { readableNote } from '@/modules/tutor/ui/messageViews';
import { listNames, PathStep, stepState, waitingOn, type StepState } from './PlanPath';

const pct = (value: number) => Math.round(value * 100);

// Every topic starts at a prior; only evidence makes it a measurement.
const isMeasured = (m: TopicMastery | undefined): m is TopicMastery =>
  !!m && (m.interactions > 0 || m.evidence.length > 0);

// Corrections are recorded for the tutor ("Learner said…"); read them back
// to the learner in the second person.
const toLearner = (details: string) => details.replace(/^(Learner|Student) /, 'You ');

function Meter({ value }: { value: number }) {
  return (
    <span className="hub-path__meter" aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }} />
    </span>
  );
}

type Explain = (nodeId: string) => TopicExplanation | undefined;

export type ContentsCorrections = {
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<unknown>;
  onResolveMisconception: (nodeId: string, misconceptionId: string) => Promise<unknown>;
};

/**
 * The Learning Hub at rest: the plan as a path, and the learner model on it.
 * Every topic says where it stands in words, and every topic with evidence
 * shows the tutor's estimate as a number. Opening a topic says what it
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
  const anyMeasured = plan.nodes.some((n) => isMeasured(mastery?.[n.id]));

  return (
    <div className="hub-contents">
      <div className="hub-contents__intro">
        {plan.goal && (
          <>
            <p className="hub-label">Your goal</p>
            <p className="hub-contents__goal">{plan.goal}</p>
          </>
        )}
        <p className="hub-contents__meta">
          {done} of {plan.nodes.length} topics done
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

      {affordances.showMastery && anyMeasured && (
        <p className="hub-contents__hint">
          Each percentage is the tutor’s estimate of how well you know that topic. Open a topic to
          see why{affordances.correctMastery ? ', or to correct it' : ''}.
        </p>
      )}
    </div>
  );
}

function statusWords(state: StepState, upNext: boolean, waiting: string[]): string {
  if (state === 'done') return 'Done';
  if (state === 'current') return 'In progress';
  if (state === 'locked') return `Starts after ${listNames(waiting)}`;
  return upNext ? 'Up next' : 'Not started';
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
  const showMastery = affordances.showMastery && measured && state !== 'locked';
  const openMisconceptions = affordances.showMastery
    ? (mastery?.misconceptions?.filter((m) => !m.resolved) ?? [])
    : [];
  const toClear = openMisconceptions.length;

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
        <span className="hub-path__name">{node.name}</span>
        {showMastery && <span className="hub-path__pct">{pct(mastery!.confidence)}%</span>}
        <span className="hub-path__sub">
          {showMastery && <Meter value={mastery!.confidence} />}
          <span className="hub-path__status">
            {statusWords(state, upNext, waiting)}
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
          {node.description && <p className="hub-topic__desc">{node.description}</p>}
          {node.objectives.length > 0 && (
            <div>
              <p className="hub-label">You’ll be able to</p>
              <ul className="hub-topic__objectives">
                {node.objectives.map((objective, i) => (
                  <li key={i}>{objective}</li>
                ))}
              </ul>
            </div>
          )}

          {showMastery && <Why mastery={mastery!} explanation={explain(node.id)} />}

          {showMastery && affordances.correctMastery && (
            <div className="hub-topic__correct">
              <span>Seems wrong?</span>
              {/* The pair wraps as one: never "Too high" on a line and "Too low" alone below. */}
              <span className="hub-topic__choices" role="group" aria-label="Correct the estimate">
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
              <p className="hub-clear__text">{m.description}</p>
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
            <p className="hub-topic__note">Starts once you’ve finished {listNames(waiting)}.</p>
          )}
        </div>
      )}
    </PathStep>
  );
}

type WhyStep = TopicExplanation['steps'][number] & { evidence?: TopicMastery['evidence'][number] };

// A step that placed the estimate rather than moving it.
const isSetting = (evidence: WhyStep['evidence']) =>
  !evidence || (typeof evidence.setTo === 'number' && evidence.kind !== 'misconception');

/** What placed the estimate directly, in the learner's words. */
function settingLabel(evidence: WhyStep['evidence']): string {
  if (evidence?.kind === 'placement') return 'Starting estimate';
  if (evidence?.kind === 'more_practice') return 'You asked for more practice';
  if (evidence?.kind === 'marked_known') return 'You marked it as known';
  if (evidence?.source === 'learner') return 'Your correction';
  if (evidence?.source === 'learner_said') return 'From what you told the tutor';
  return 'Set by the tutor';
}

/** One line of "Why N%": what a piece of evidence did, or where it set the estimate. */
function WhyLine({ step: { evidence, before, after } }: { step: WhyStep }) {
  if (isSetting(evidence)) {
    const details = evidence?.details ? toLearner(evidence.details) : '';
    return (
      <li className="is-edge">
        <span className="hub-why__figure">{pct(after)}%</span>
        <span>
          {settingLabel(evidence)}
          {details && <span className="hub-why__note">{details}</span>}
        </span>
      </li>
    );
  }
  const delta = pct(after) - pct(before);
  return (
    <li>
      <span className={`hub-why__figure${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}`}>
        {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0'}
      </span>
      <span>
        {evidence!.type === 'self_report'
          ? toLearner(evidence!.details)
          : readableNote(evidence!.details)}
      </span>
    </li>
  );
}

/**
 * "Why N%": where the estimate started, each change in the order it came, and
 * where it stands now, so the lines add up in front of the learner. Once the
 * estimate has been set directly (a correction, more practice), the count
 * starts again there; what came before is folded away, since it no longer
 * adds up to today's number.
 */
function Why({ mastery, explanation }: { mastery: TopicMastery; explanation?: TopicExplanation }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const start = explanation?.start ?? mastery.confidence;
  const steps: WhyStep[] = (explanation?.steps ?? []).map((step) => ({
    ...step,
    evidence: mastery.evidence.find((entry) => entry.eventId === step.eventId),
  }));
  const settledAt = explanation?.settledAt ?? -1;
  const counting = settledAt >= 0 ? steps.slice(settledAt) : steps;
  const earlier = settledAt >= 0 ? steps.slice(0, settledAt) : [];
  const startLine = (
    <li className="is-edge">
      <span className="hub-why__figure">{pct(start)}%</span>
      <span>{mastery.baseline != null ? 'Carried over from before' : 'Starting estimate'}</span>
    </li>
  );

  return (
    <div className="hub-why">
      <p className="hub-label">Why {pct(mastery.confidence)}%</p>
      {settledAt >= 0 && (
        <button
          type="button"
          className="hub-why__earlier"
          aria-expanded={showEarlier}
          onClick={() => setShowEarlier((open) => !open)}
        >
          {showEarlier ? 'Hide' : 'Show'} what came before
        </button>
      )}
      {settledAt >= 0 && showEarlier && (
        <ol className="hub-why__list is-history">
          {startLine}
          {earlier.map((step, i) => (
            <WhyLine key={i} step={step} />
          ))}
        </ol>
      )}
      <ol className="hub-why__list">
        {settledAt < 0 && startLine}
        {counting.map((step, i) => (
          <WhyLine key={i} step={step} />
        ))}
        <li className="is-now">
          <span className="hub-why__figure">{pct(mastery.confidence)}%</span>
          <span>Now</span>
        </li>
      </ol>
    </div>
  );
}
