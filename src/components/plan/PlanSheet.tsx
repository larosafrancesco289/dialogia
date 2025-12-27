'use client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel } from '@/lib/types';
import { PlanView } from './PlanView';
import { updateNodeStatus } from '@/lib/learningPlan/service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';

export function PlanSheet({
  plan,
  isOpen,
  onClose,
  onUpdate,
  onStartLesson,
  learnerModel,
  focusNodeId,
  onLearnerModelFeedback,
  latestUpdateSummary,
}: {
  plan: LearningPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updatedPlan: LearningPlan) => void;
  onStartLesson?: (nodeId: string) => void;
  learnerModel?: LearnerModel;
  focusNodeId?: string;
  onLearnerModelFeedback?: (feedback: LearnerModelFeedback) => void;
  latestUpdateSummary?: string;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  const handleRequestClose = useCallback(() => {
    setClosing((wasClosing) => {
      if (wasClosing) return wasClosing;
      onClose();
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setClosing(false);
      return;
    }
    if (!isOpen && shouldRender) {
      setClosing(true);
      const timer = window.setTimeout(() => {
        setClosing(false);
        setShouldRender(false);
      }, 210);
      return () => window.clearTimeout(timer);
    }
    return;
  }, [isOpen, shouldRender]);

  // Close on Escape key
  useEffect(() => {
    if (!shouldRender) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [shouldRender, handleRequestClose]);

  // Prevent body scroll when open and restore previous overflow when closed
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
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[70] bg-black/30 settings-overlay plan-sheet-overlay${
          closing ? ' is-closing' : ''
        }`}
        onClick={handleRequestClose}
        aria-hidden="true"
      />

      {/* Side Sheet */}
      <div
        className={`plan-sheet settings-drawer fixed inset-y-0 right-0 z-[80] w-full overflow-y-auto border-l border-border shadow-[var(--shadow-card)] sm:w-[55vw] md:max-w-xl${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-sheet-title"
        style={{
          overscrollBehavior: 'contain',
          paddingBottom: bottomSafePadding,
          background: 'var(--surface-paper)',
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

        {/* Subtle rule */}
        <div className="pointer-events-none h-px" style={{ background: 'var(--rule-accent)' }} />

        {/* Content */}
        <div className="plan-sheet__body px-4 pt-5 pb-10 sm:px-6 w-full h-full">
          <PlanView
            plan={plan}
            onNodeStatusChange={handleNodeStatusChange}
            onStartLesson={onStartLesson}
            learnerModel={learnerModel}
            focusNodeId={focusNodeId}
            onLearnerModelFeedback={onLearnerModelFeedback}
            latestUpdateSummary={latestUpdateSummary}
          />
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
