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

/** What a locked topic is waiting on, by name, in plan order. */
export function waitingOn(plan: LearningPlan, node: LearningPlanNode): string[] {
  return unmetPrerequisites(plan, node).map((p) => p.name);
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
