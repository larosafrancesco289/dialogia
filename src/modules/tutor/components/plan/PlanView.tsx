import { useState, useMemo, useCallback, useEffect } from 'react';
import type { LearningPlan, LearnerModel, LearningPlanNode } from '@/lib/types';
import {
  isNodeReady,
  getAllPrerequisites,
  getNextNode,
} from '@/modules/tutor/learning-plan/service';
import { PlanNode } from './PlanNode';

type SortMode = 'plan' | 'attention';

type PlanNodeSection = 'in_progress' | 'up_next' | 'completed' | 'locked';

type Section = {
  key: PlanNodeSection;
  label: string;
  nodes: LearningPlanNode[];
};

export function PlanView({
  plan,
  learnerModel,
  learnerModelVisible,
  readOnly,
  focusNodeId,
  onNodeStatusChange: _onNodeStatusChange,
  onStartLesson: _onStartLesson,
  onMarkKnown,
  onConfidenceAdjust,
  onMisconceptionResolve,
  onFlagForReview,
}: {
  plan: LearningPlan;
  learnerModel?: LearnerModel;
  learnerModelVisible?: boolean;
  readOnly?: boolean;
  focusNodeId?: string;
  onNodeStatusChange?: (
    nodeId: string,
    status: 'not_started' | 'in_progress' | 'completed',
  ) => void;
  onStartLesson?: (nodeId: string) => void;
  onMarkKnown?: (nodeId: string) => void;
  onConfidenceAdjust?: (nodeId: string, newConfidence: number, reason?: string) => void;
  onMisconceptionResolve?: (nodeId: string, misconceptionId: string) => void;
  onFlagForReview?: (nodeId: string) => void;
}) {
  const uiLearnerModel = learnerModelVisible ? learnerModel : undefined;

  // Auto-expand the current recommended topic (in-progress when available, otherwise next ready).
  const currentNodeId = getNextNode(plan)?.id;
  const defaultExpanded = focusNodeId ?? currentNodeId ?? null;

  const [expandedId, setExpandedId] = useState<string | null>(defaultExpanded);
  const [sortMode, setSortMode] = useState<SortMode>('plan');

  // Update expanded node when the in-progress topic changes
  useEffect(() => {
    if (currentNodeId) setExpandedId(currentNodeId);
  }, [currentNodeId]);

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  // Classify nodes into sections
  const sections = useMemo((): Section[] => {
    const inProgress: LearningPlanNode[] = [];
    const upNext: LearningPlanNode[] = [];
    const completed: LearningPlanNode[] = [];
    const locked: LearningPlanNode[] = [];

    for (const node of plan.nodes) {
      if (node.status === 'in_progress') {
        inProgress.push(node);
      } else if (node.status === 'completed') {
        completed.push(node);
      } else if (isNodeReady(node.id, plan)) {
        upNext.push(node);
      } else {
        locked.push(node);
      }
    }

    if (sortMode === 'attention' && uiLearnerModel) {
      const byMastery = (a: LearningPlanNode, b: LearningPlanNode) => {
        const confA = uiLearnerModel.mastery?.[a.id]?.confidence ?? 0;
        const confB = uiLearnerModel.mastery?.[b.id]?.confidence ?? 0;
        return confA - confB; // lowest first
      };
      inProgress.sort(byMastery);
      upNext.sort(byMastery);
      completed.sort(byMastery);
    }

    const result: Section[] = [];
    if (inProgress.length)
      result.push({ key: 'in_progress', label: 'In progress', nodes: inProgress });
    if (upNext.length) result.push({ key: 'up_next', label: 'Up next', nodes: upNext });
    if (completed.length) result.push({ key: 'completed', label: 'Completed', nodes: completed });
    if (locked.length) result.push({ key: 'locked', label: 'Locked', nodes: locked });
    return result;
  }, [plan, sortMode, uiLearnerModel]);

  const handleSortModeChange = useCallback(
    (next: SortMode) => {
      if (next === sortMode) return;
      setSortMode(next);
    },
    [sortMode],
  );

  return (
    <div className="plan-index">
      {/* Sort toggle */}
      {learnerModelVisible && uiLearnerModel && (
        <div className="plan-sort-row">
          <span className="plan-sort-row__label">Sort</span>
          <div className="plan-sort-pills">
            <button
              className={`plan-sort-pill ${sortMode === 'plan' ? 'plan-sort-pill--on' : ''}`}
              onClick={() => handleSortModeChange('plan')}
            >
              By plan
            </button>
            <button
              className={`plan-sort-pill ${sortMode === 'attention' ? 'plan-sort-pill--on' : ''}`}
              onClick={() => handleSortModeChange('attention')}
            >
              By attention
            </button>
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.key}>
          <div className="plan-section-sep">
            <span>{section.label}</span>
          </div>
          {section.nodes.map((node) => {
            const ready = isNodeReady(node.id, plan);
            const nodeIsLocked = node.status === 'not_started' && !ready;
            const prerequisites = getAllPrerequisites(node.id, plan);

            return (
              <PlanNode
                key={node.id}
                node={node}
                isReady={ready}
                isLocked={nodeIsLocked}
                isCurrent={node.id === currentNodeId}
                mastery={uiLearnerModel?.mastery?.[node.id]}
                learnerModelVisible={learnerModelVisible}
                readOnly={readOnly}
                expanded={expandedId === node.id}
                onToggle={() => handleToggle(node.id)}
                onMarkKnown={onMarkKnown}
                onConfidenceAdjust={onConfidenceAdjust}
                onMisconceptionResolve={onMisconceptionResolve}
                onFlagForReview={onFlagForReview}
                prerequisites={prerequisites}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
