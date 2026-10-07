import { useEffect, useState } from 'react';
import type { LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import { isMeasured, nextReadyNode, type TopicExplanation } from '@/modules/tutor/engine';
import type { TutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { readableNote } from '@/modules/tutor/ui/messageViews';
import { formatList, formatPercent } from '@/lib/i18n/format';
import { useT, type TutorTranslate } from '@/modules/tutor/i18n';
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
  const t = useT();
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
            <p className="hub-label">{t('hub.goal')}</p>
            <p className="hub-contents__goal">
              <Markdown inline content={plan.goal} />
            </p>
          </>
        )}
        <p className="hub-contents__meta">
          {t('hub.topicsDone', { done, count: plan.nodes.length })}
          {hours != null ? ` · ${t('hub.hours', { count: hours })}` : ''}
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
          {t(affordances.correctMastery ? 'hub.hintCorrect' : 'hub.hint')}
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
  const t = useT();
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
        {showMastery && <span className="hub-path__pct">{formatPercent(percent / 100)}</span>}
        <span className="hub-path__sub">
          {showMastery && <Meter value={mastery!.confidence} />}
          <span className="hub-path__status">
            <Markdown inline content={statusWords(state, upNext, waiting)} />
            {toClear > 0 && (
              <>
                {' · '}
                <span className="hub-path__warn">{t('hub.toClear', { count: toClear })}</span>
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
              <p className="hub-label">{t('hub.objectives')}</p>
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

          {showMastery && affordances.correctMastery && !saidFelt && (
            <div className="hub-topic__correct">
              <span>{t('hub.seemsWrong')}</span>
              {/* The pair wraps as one: never "Too high" on a line and "Too low" alone below. */}
              <span className="estimate-choices" role="group" aria-label={t('hub.correct')}>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void act(() => corrections.onContestMastery(node.id, 'down'))}
                >
                  {t('hub.tooHigh')}
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void act(() => corrections.onContestMastery(node.id, 'up'))}
                >
                  {t('hub.tooLow')}
                </button>
              </span>
            </div>
          )}

          {openMisconceptions.map((m) => (
            <div key={m.id} className="hub-clear">
              <p className="hub-label">{t('hub.toClearLabel')}</p>
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
                  {t('hub.gotIt')}
                </button>
              )}
            </div>
          ))}

          {state === 'locked' && waiting.length > 0 && (
            <p className="hub-topic__note">
              <Markdown inline content={t('hub.startsOnce', { topics: formatList(waiting) })} />
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

// A setting that is where the estimate starts: the plan's starting estimate, or one carried over.
const isStart = (evidence: WhyStep['evidence']) =>
  !evidence ||
  evidence.kind === 'placement' ||
  evidence.source === 'placement' ||
  !!evidence.carriedOver;

/** What placed the estimate directly, in the learner's words. */
function settingLabel(t: TutorTranslate, evidence: WhyStep['evidence']): string {
  if (evidence?.kind === 'placement') return t('why.starting');
  if (evidence?.kind === 'more_practice') return t('why.morePractice');
  if (evidence?.kind === 'marked_known') return t('why.markedKnown');
  if (evidence?.source === 'learner') return t('why.corrected');
  if (evidence?.source === 'learner_said') return t('why.told');
  return t('why.byTutor');
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
  const t = useT();
  const setting = isSetting(evidence);
  const details = evidence?.details ? readableNote(evidence.details) : '';
  // The learner's own correction is its own sentence ("You said the estimate
  // felt too high."), as is where a carried-over estimate came from; other
  // settings are named, with their reason under.
  const own = evidence?.source === 'learner' && evidence.kind === 'adjusted' && !!details;
  const carried = evidence?.carriedOver;
  const delta = pct(after) - pct(before);
  const figure = first
    ? formatPercent(pct(after) / 100)
    : delta > 0
      ? `+${delta}`
      : delta < 0
        ? `−${-delta}`
        : '+0';
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
            {settingLabel(t, evidence)}
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
  const t = useT();
  const start = explanation?.start ?? mastery.confidence;
  const steps: WhyStep[] = (explanation?.steps ?? []).map((step) => ({
    ...step,
    evidence: mastery.evidence.find((entry) => entry.eventId === step.eventId),
  }));
  // A starting estimate set by the plan (or carried over) is the start: no prior
  // line above it. Anything else, a correction included, moves on from the prior.
  const opensWithStart = steps.length > 0 && isStart(steps[0].evidence);
  // With nothing since the start, the start line already states today's value.
  const startIsNow = steps.length === (opensWithStart ? 1 : 0);

  return (
    <div className="hub-why">
      <p className="hub-label">
        {t('why.title', { percent: formatPercent(pct(mastery.confidence) / 100) })}
      </p>
      <ol className="hub-why__list">
        {!opensWithStart && (
          <li className="is-edge">
            <span className="hub-why__figure">{formatPercent(pct(start) / 100)}</span>
            <span>{t(mastery.baseline != null ? 'why.carriedBefore' : 'why.starting')}</span>
          </li>
        )}
        {steps.map((step, i) => (
          <WhyLine
            key={i}
            step={step}
            first={i === 0 && opensWithStart}
            topic={explanation?.name ?? mastery.nodeId}
          />
        ))}
        {!startIsNow && (
          <li className="is-now">
            <span className="hub-why__figure">{formatPercent(pct(mastery.confidence) / 100)}</span>
            <span>{t('why.now')}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
