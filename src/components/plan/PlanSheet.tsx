'use client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import { PlanView } from './PlanView';
import { updateNodeStatus } from '@/lib/agent/planGenerator';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export function PlanSheet({
  plan,
  isOpen,
  onClose,
  onUpdate,
}: {
  plan: LearningPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updatedPlan: LearningPlan) => void;
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
        className={`plan-sheet settings-drawer fixed inset-y-0 right-0 z-[80] w-full overflow-y-auto border-l border-border shadow-[var(--shadow-card)] sm:w-[640px]${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-sheet-title"
        style={{
          overscrollBehavior: 'contain',
          paddingBottom: bottomSafePadding,
          background: 'var(--glass-panel-bg)',
        }}
      >
        {/* Header */}
        <div
          className="plan-sheet__header glass sticky z-10 flex items-center gap-4 border-b border-border px-4 py-3 sm:px-6"
          style={{
            top: 0,
            paddingTop: topSafePadding,
            paddingBottom: 'var(--space-3)',
          }}
        >
          <div className="flex min-w-0 flex-col">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'color-mix(in oklab, var(--color-accent) 80%, var(--color-fg) 20%)' }}
            >
              Personalized journey
            </span>
            <h2
              id="plan-sheet-title"
              className="text-xl font-semibold leading-tight"
              style={{ color: 'var(--color-fg)' }}
            >
              Learning Plan
            </h2>
            <span className="mt-1 truncate text-xs text-muted-foreground">{headingSubtitle}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className="hidden rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider sm:inline-flex"
              style={{
                color: 'color-mix(in oklab, var(--color-accent) 80%, var(--color-fg) 20%)',
                border: '1px solid color-mix(in oklab, var(--color-accent) 45%, var(--color-border))',
                background: 'color-mix(in oklab, var(--color-accent) 15%, var(--color-surface))',
              }}
            >
              {plan.nodes.length} topics
            </span>
            <button
              onClick={handleRequestClose}
              className="icon-button glass"
              aria-label="Close plan view"
              title="Close (Esc)"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Gradient accent */}
        <div
          className="pointer-events-none h-1"
          style={{
            background:
              'linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-accent) 45%, transparent), transparent)',
          }}
        />

        {/* Content */}
        <div className="plan-sheet__body space-y-6 px-5 pb-10 pt-6 sm:px-8 max-w-3xl mx-auto w-full">
          <PlanView plan={plan} onNodeStatusChange={handleNodeStatusChange} />
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
