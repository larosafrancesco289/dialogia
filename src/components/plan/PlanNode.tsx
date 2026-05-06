'use client';
import { useState, useCallback } from 'react';
import type { LearningPlanNode, TopicMastery } from '@/lib/types';
import { EditConfirmDialog, EditConfirmAction } from './EditConfirmDialog';

const CIRCUMFERENCE = 2 * Math.PI * 16; // r=16, matching POC

function masteryLevel(confidence: number) {
  if (confidence >= 0.7) return { label: 'Strong', color: 'var(--color-success)' };
  if (confidence >= 0.4) return { label: 'Developing', color: 'var(--color-accent)' };
  return { label: 'Needs work', color: 'var(--color-danger)' };
}

function badgeClass(confidence: number) {
  if (confidence >= 0.7) return 'plan-index-badge--hi';
  if (confidence >= 0.4) return 'plan-index-badge--mi';
  return 'plan-index-badge--lo';
}

export function PlanNode({
  node,
  isReady,
  isLocked,
  isCurrent,
  mastery,
  learnerModelVisible,
  readOnly,
  expanded,
  onToggle,
  onMarkKnown,
  onConfidenceAdjust,
  onMisconceptionResolve,
  onFlagForReview,
  onInteraction,
  prerequisites,
}: {
  node: LearningPlanNode;
  isReady: boolean;
  isLocked: boolean;
  isCurrent: boolean;
  mastery?: TopicMastery;
  learnerModelVisible?: boolean;
  readOnly?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMarkKnown?: (nodeId: string) => void;
  onConfidenceAdjust?: (nodeId: string, newConfidence: number, reason?: string) => void;
  onMisconceptionResolve?: (nodeId: string, misconceptionId: string) => void;
  onFlagForReview?: (nodeId: string) => void;
  onInteraction?: (
    nodeId: string,
    interaction: 'confidence_adjust' | 'mark_known' | 'misconception_resolve' | 'flag_for_review',
  ) => void;
  prerequisites: LearningPlanNode[];
}) {
  const [pendingAction, setPendingAction] = useState<EditConfirmAction | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);

  const confidence = mastery ? Math.round((mastery.confidence ?? 0) * 100) : 0;
  const unresolved = mastery?.misconceptions?.filter((m) => !m.resolved) ?? [];
  const level = masteryLevel(confidence / 100);

  const handleConfirm = useCallback(() => {
    pendingCallback?.();
    setPendingAction(null);
    setPendingCallback(null);
  }, [pendingCallback]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
    setPendingCallback(null);
    setSliderValue(null);
  }, []);

  const handleMarkKnown = useCallback(() => {
    setPendingAction({ type: 'mark_known', nodeId: node.id, nodeName: node.name });
    setPendingCallback(() => () => {
      onInteraction?.(node.id, 'mark_known');
      onMarkKnown?.(node.id);
    });
  }, [node.id, node.name, onInteraction, onMarkKnown]);

  const handleSliderCommit = useCallback(
    (value: number) => {
      const newConf = value / 100;
      setPendingAction({
        type: 'confidence_adjust',
        nodeId: node.id,
        nodeName: node.name,
        from: mastery?.confidence ?? 0,
        to: newConf,
      });
      setPendingCallback(() => () => {
        onInteraction?.(node.id, 'confidence_adjust');
        onConfidenceAdjust?.(node.id, newConf, `Adjusted to ${value}%`);
      });
    },
    [node.id, node.name, mastery?.confidence, onConfidenceAdjust, onInteraction],
  );

  const commitSliderIfChanged = useCallback(() => {
    if (sliderValue != null && sliderValue !== confidence) {
      handleSliderCommit(sliderValue);
    }
  }, [sliderValue, confidence, handleSliderCommit]);

  const handleResolveMisconception = useCallback(
    (miscId: string, miscDesc: string) => {
      setPendingAction({
        type: 'misconception_resolve',
        nodeId: node.id,
        nodeName: node.name,
        misconceptionDesc: miscDesc,
      });
      setPendingCallback(() => () => {
        onInteraction?.(node.id, 'misconception_resolve');
        onMisconceptionResolve?.(node.id, miscId);
      });
    },
    [node.id, node.name, onInteraction, onMisconceptionResolve],
  );

  const handleFlagForReview = useCallback(() => {
    setPendingAction({ type: 'flag_review', nodeId: node.id, nodeName: node.name });
    setPendingCallback(() => () => {
      onInteraction?.(node.id, 'flag_for_review');
      onFlagForReview?.(node.id);
    });
  }, [node.id, node.name, onFlagForReview, onInteraction]);

  function getDotClass(): string {
    if (node.status === 'in_progress') return 'plan-index-dot--act';
    if (node.status === 'completed') return 'plan-index-dot--done';
    if (isLocked) return 'plan-index-dot--lock';
    return 'plan-index-dot--idl';
  }
  const dotClass = getDotClass();

  function getStatusText(): string {
    if (node.status === 'in_progress') return 'In progress';
    if (node.status === 'completed') return 'Completed';
    if (isLocked) {
      if (!prerequisites.length) return 'Locked';
      return `Requires ${prerequisites.length} prerequisite${prerequisites.length === 1 ? '' : 's'}`;
    }
    if (node.estimatedMinutes) return `~${node.estimatedMinutes} min`;
    return '';
  }
  const statusText = getStatusText();
  const lockedPrerequisites = prerequisites.map((p) => p.name).join(' & ');

  const rowClasses = [
    'plan-index-row',
    isCurrent && 'plan-index-row--cur',
    isLocked && 'plan-index-row--lk',
    expanded && 'plan-index-row--open',
  ]
    .filter(Boolean)
    .join(' ');

  const displaySlider = sliderValue ?? confidence;

  return (
    <>
      <div
        className={rowClasses}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className={`plan-index-dot ${dotClass}`} />
        <span className="plan-index-row__name">{node.name}</span>

        {learnerModelVisible && mastery ? (
          <>
            {unresolved.length > 0 && (
              <svg
                className="plan-index-warn"
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="var(--color-danger)"
              >
                <path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" />
              </svg>
            )}
            <span className={`plan-index-badge ${badgeClass(mastery.confidence ?? 0)}`}>
              {confidence}%
            </span>
          </>
        ) : (
          <span
            className={`plan-index-status ${node.status === 'in_progress' ? 'plan-index-status--ip' : ''}`}
            title={isLocked && lockedPrerequisites ? `Requires ${lockedPrerequisites}` : undefined}
          >
            {statusText}
          </span>
        )}

        <span className="plan-index-chevron">&#x25B8;</span>
      </div>

      {expanded && (
        <div className="plan-expanded">
          <div className="plan-expanded__card">
            {node.description && <p className="plan-expanded__desc">{node.description}</p>}

            {/* Condition B: mastery block */}
            {learnerModelVisible && mastery && (
              <>
                <div className="plan-mastery-block">
                  <div className="plan-mastery-ring">
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        fill="none"
                        stroke="var(--rule-light)"
                        strokeWidth="3.5"
                      />
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        fill="none"
                        stroke={level.color}
                        strokeWidth="3.5"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={CIRCUMFERENCE * (1 - confidence / 100)}
                        strokeLinecap="round"
                        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                      />
                    </svg>
                    <div className="plan-mastery-ring__val" style={{ color: level.color }}>
                      {confidence}
                    </div>
                  </div>
                  <div className="plan-mastery-info">
                    <div className="plan-mastery-info__level" style={{ color: level.color }}>
                      {level.label}
                    </div>
                    <div className="plan-mastery-info__sub">
                      {mastery.interactions} interaction{mastery.interactions === 1 ? '' : 's'}
                      {node.estimatedMinutes ? ` \u00b7 ~${node.estimatedMinutes} min` : ''}
                    </div>
                    <div className="plan-mastery-bar">
                      <div
                        className="plan-mastery-bar__fill"
                        style={{
                          transform: `scaleX(${confidence / 100})`,
                          background: level.color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Confidence slider */}
                {!readOnly && onConfidenceAdjust && (
                  <div className="plan-slider-row" onClick={(e) => e.stopPropagation()}>
                    <span className="plan-slider-row__label">Adjust</span>
                    <input
                      type="range"
                      className="plan-slider-row__input"
                      min={0}
                      max={100}
                      value={displaySlider}
                      onChange={(e) => setSliderValue(Number(e.target.value))}
                      onMouseUp={commitSliderIfChanged}
                      onTouchEnd={commitSliderIfChanged}
                    />
                    <span
                      className="plan-slider-row__val"
                      style={{ color: masteryLevel(displaySlider / 100).color }}
                    >
                      {displaySlider}%
                    </span>
                  </div>
                )}

                {/* Misconception alert */}
                {unresolved.map((m) => (
                  <div
                    key={m.id}
                    className="plan-misconception"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" />
                    </svg>
                    <div className="plan-misconception__text">
                      {m.description}
                      {m.occurrences > 1 && (
                        <div className="plan-misconception__meta">Seen {m.occurrences}x</div>
                      )}
                      {!readOnly && onMisconceptionResolve && (
                        <button
                          className="plan-misconception__resolve"
                          onClick={() => handleResolveMisconception(m.id, m.description)}
                        >
                          Mark resolved
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Condition A: meta line */}
            {!learnerModelVisible && (
              <div className="plan-expanded__meta">
                {node.estimatedMinutes && <span>~{node.estimatedMinutes} min</span>}
                {node.objectives.length > 0 && (
                  <>
                    <span>&middot;</span>
                    <span>{node.objectives.length} objectives</span>
                  </>
                )}
                {mastery && (
                  <>
                    <span>&middot;</span>
                    <span>{mastery.interactions} interactions</span>
                  </>
                )}
              </div>
            )}

            {/* Objectives */}
            {node.objectives.length > 0 && (
              <ul className="plan-expanded__objs">
                {node.objectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            )}

            {/* Action buttons (Condition B, non-readonly) */}
            {learnerModelVisible && !readOnly && (
              <div className="plan-expanded__actions" onClick={(e) => e.stopPropagation()}>
                {isReady && node.status !== 'completed' && onMarkKnown && (
                  <button className="plan-action-btn plan-action-btn--ok" onClick={handleMarkKnown}>
                    &#10003; I know this
                  </button>
                )}
                {onFlagForReview && (
                  <button className="plan-action-btn" onClick={handleFlagForReview}>
                    Need more practice
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <EditConfirmDialog
        isOpen={pendingAction !== null}
        action={pendingAction}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
