'use client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel } from '@/lib/types';
import { PlanView } from './PlanView';
import { PlanEditingHint } from './PlanEditingHint';
import { SummaryStrip } from '@/components/learning-panel/SummaryStrip';
import { updateNodeStatus } from '@/lib/learning-plan/service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlanFeedbackModal, type PlanFeedbackContext } from './PlanFeedbackModal';

export type LearnerModelEditCallbacks = {
  onConfidenceAdjust: (nodeId: string, newConfidence: number, reason?: string) => void;
  onMisconceptionResolve: (nodeId: string, misconceptionId: string) => void;
  onSetConfidenceFloor: (nodeId: string, floor: number) => void;
  onFlagForReview: (nodeId: string) => void;
  onMarkKnown: (nodeId: string) => void;
};

export function PlanSheet({
  plan,
  isOpen,
  onClose,
  onUpdate,
  onStartLesson,
  learnerModel,
  focusNodeId,
  onConfidenceAdjust,
  onMisconceptionResolve,
  onFlagForReview,
  onMarkKnown,
  onSendFeedback,
}: {
  plan: LearningPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updatedPlan: LearningPlan) => void;
  onStartLesson?: (nodeId: string) => void;
  learnerModel?: LearnerModel;
  focusNodeId?: string;
  onSendFeedback?: (message: string) => void;
} & Partial<LearnerModelEditCallbacks>) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<PlanFeedbackContext | null>(null);

  const handleRequestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    onClose();
  }, [closing, onClose]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setClosing(false);
      return;
    }
    if (shouldRender) {
      setClosing(true);
      const timer = window.setTimeout(() => {
        setClosing(false);
        setShouldRender(false);
      }, 210);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (feedbackContext) return;
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [shouldRender, handleRequestClose, feedbackContext]);

  useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  const planMetadataSummary = useMemo(() => {
    if (!plan?.metadata) return '';
    const { difficulty, estimatedHours } = plan.metadata;
    const parts: string[] = [];
    if (difficulty) parts.push(difficulty);
    if (estimatedHours) parts.push(`${estimatedHours}h`);
    return parts.join(' · ');
  }, [plan]);

  const handleFeedbackSubmit = useCallback(
    (feedback: string, context: PlanFeedbackContext) => {
      if (!onSendFeedback) return;
      const prefix =
        context.type === 'phase' ? `Plan feedback for ${context.phaseName}:\n` : 'Plan feedback:\n';
      onSendFeedback(`${prefix}${feedback}\nPlease update the plan and confirm the changes.`);
    },
    [onSendFeedback],
  );

  useEffect(() => {
    if (!isOpen) setFeedbackContext(null);
  }, [isOpen]);

  if (!plan || !shouldRender) return null;
  if (typeof document === 'undefined') return null;

  const topSafePadding = 'calc(env(safe-area-inset-top) + var(--space-3))';
  const bottomSafePadding = 'calc(env(safe-area-inset-bottom) + 1.25rem)';

  const handleNodeStatusChange = (
    nodeId: string,
    status: 'not_started' | 'in_progress' | 'completed',
  ) => {
    const updatedPlan = updateNodeStatus(plan, nodeId, status);
    onUpdate?.(updatedPlan);
  };

  const headingSubtitle =
    planMetadataSummary || new Date(plan.generatedAt || Date.now()).toLocaleDateString();

  const sheet = (
    <>
      <div
        className={`fixed inset-0 z-[70] bg-black/30 settings-overlay plan-sheet-overlay${closing ? ' is-closing' : ''}`}
        onClick={handleRequestClose}
        aria-hidden="true"
      />

      <div
        className={`plan-sheet settings-drawer fixed inset-y-0 right-0 z-[80] w-full overflow-hidden border-l border-border shadow-[var(--shadow-card)] sm:w-[55vw] md:max-w-xl${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-sheet-title"
        style={{
          overscrollBehavior: 'contain',
          paddingBottom: bottomSafePadding,
          background: 'var(--surface-paper)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="plan-sheet__header sticky z-10 flex items-center gap-4 border-b border-border px-4 py-3 sm:px-6"
          style={{
            top: 0,
            paddingTop: topSafePadding,
            paddingBottom: 'var(--space-3)',
            background: 'var(--surface-paper)',
            flexShrink: 0,
          }}
        >
          <div className="flex min-w-0 flex-col">
            <h2
              id="plan-sheet-title"
              className="text-lg font-bold leading-tight"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-serif-assistant)' }}
            >
              Learning Hub
            </h2>
            <span className="mt-0.5 truncate text-xs text-muted-foreground">{headingSubtitle}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className="hidden px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:inline-flex"
              style={{
                color: 'var(--color-accent)',
                border: '1px solid var(--rule-accent)',
                background: 'var(--marginalia-bg)',
                borderRadius: 'var(--radius-editorial)',
              }}
            >
              {plan.nodes.length} topics
            </span>
            <button
              onClick={handleRequestClose}
              className="icon-button"
              aria-label="Close learning hub"
              title="Close (Esc)"
              style={{ background: 'var(--marginalia-bg)' }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <SummaryStrip learnerModel={learnerModel} plan={plan} learnerModelVisible />

        {/* Agency cue */}
        <PlanEditingHint />

        {/* Scrollable content */}
        <div className="plan-sheet__body flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-6">
          <PlanView
            plan={plan}
            focusNodeId={focusNodeId}
            learnerModel={learnerModel}
            learnerModelVisible
            onNodeStatusChange={handleNodeStatusChange}
            onStartLesson={onStartLesson}
            onMarkKnown={onMarkKnown}
            onConfidenceAdjust={onConfidenceAdjust}
            onMisconceptionResolve={onMisconceptionResolve}
            onFlagForReview={onFlagForReview}
          />
        </div>

        {/* Bottom bar */}
        <div className="learning-panel__bottom-bar" style={{ flexShrink: 0 }}>
          <button
            className="plan-bottom-btn plan-bottom-btn--pri"
            onClick={() => setFeedbackContext({ type: 'general' })}
          >
            Suggest plan changes
          </button>
        </div>
      </div>

      {feedbackContext && (
        <PlanFeedbackModal
          isOpen
          context={feedbackContext}
          onSubmit={handleFeedbackSubmit}
          onClose={() => setFeedbackContext(null)}
        />
      )}
    </>
  );

  return createPortal(sheet, document.body);
}
