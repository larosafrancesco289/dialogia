import type { ReactNode } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import { unmetPrerequisites } from '@/modules/tutor/engine';

export type StepState = 'done' | 'current' | 'ready' | 'locked';

export function stepState(plan: LearningPlan, node: LearningPlanNode): StepState {
  if (node.status === 'completed') return 'done';
  if (node.status === 'in_progress') return 'current';
  return unmetPrerequisites(plan, node).length > 0 ? 'locked' : 'ready';
}

/** A topic's estimate as a hairline bar under its name. */
export function Meter({ value }: { value: number }) {
  return (
    <span className="hub-path__meter" aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }} />
    </span>
  );
}

/**
 * What a locked topic is waiting on, by name, in plan order, except the topic
 * just before it: on a path that goes without saying, and under every topic of
 * a linear plan it would only repeat.
 */
export function waitingOn(plan: LearningPlan, node: LearningPlanNode): string[] {
  const before = plan.nodes[plan.nodes.indexOf(node) - 1];
  return unmetPrerequisites(plan, node)
    .filter((p) => p !== before)
    .map((p) => p.name);
}

/**
 * One step on the plan's path: a numbered stop on a line, a check once done,
 * a ring where the learner is. The line runs on to the next step in ink once
 * this one is done, so how far the plan has come reads without a word.
 */
export function PathStep({
  state,
  number,
  className,
  children,
}: {
  state: StepState;
  number: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={`hub-path__step is-${state}${className ? ` ${className}` : ''}`}>
      <span className="hub-path__dot" aria-hidden="true">
        {state === 'done' ? <CheckIcon /> : number}
      </span>
      <div className="hub-path__body">{children}</div>
    </li>
  );
}
