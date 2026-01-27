'use client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel, StudyCondition } from '@/lib/types';
import { PlanView } from './PlanView';
import { MyProgressView } from './MyProgressView';
import { HubTabs, HubTabId } from './HubTabs';
import { updateNodeStatus } from '@/lib/learningPlan/service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';
import { AnimatePresence, motion } from 'framer-motion';

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
  onLearnerModelFeedback,
  latestUpdateSummary,
  onConfidenceAdjust,
  onMisconceptionResolve,
  onSetConfidenceFloor,
  onFlagForReview,
  onMarkKnown,
  defaultTab = 'plan',
  studyCondition,
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
  defaultTab?: HubTabId;
  studyCondition?: StudyCondition;
} & Partial<LearnerModelEditCallbacks>) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTabId>(defaultTab);

  // Reset tab when sheet opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

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

  const isConditionA = studyCondition === 'A';

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

        {/* Tab Navigation */}
        {!isConditionA && (
          <div className="px-4 py-3 sm:px-6" style={{ background: 'var(--surface-paper)' }}>
            <HubTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        )}

        {/* Subtle rule */}
        <div className="pointer-events-none h-px" style={{ background: 'var(--rule-accent)' }} />

        {/* Content */}
        <div className="plan-sheet__body px-4 pt-5 pb-10 sm:px-6 w-full h-full">
          <AnimatePresence mode="wait">
            {isConditionA || activeTab === 'plan' ? (
              <motion.div
                key="plan"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
              >
                <PlanView
                  plan={plan}
                  focusNodeId={focusNodeId}
                  readOnly={isConditionA}
                  {...(!isConditionA && {
                    onNodeStatusChange: handleNodeStatusChange,
                    onStartLesson,
                    learnerModel,
                    onLearnerModelFeedback,
                    latestUpdateSummary,
                    onMarkKnown,
                  })}
                />
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <MyProgressView
                  plan={plan}
                  learnerModel={learnerModel}
                  focusNodeId={focusNodeId}
                  onConfidenceAdjust={onConfidenceAdjust ?? (() => {})}
                  onMisconceptionResolve={onMisconceptionResolve ?? (() => {})}
                  onSetConfidenceFloor={onSetConfidenceFloor ?? (() => {})}
                  onFlagForReview={onFlagForReview ?? (() => {})}
                  onMarkKnown={onMarkKnown ?? (() => {})}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
