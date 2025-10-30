'use client';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import { PlanView } from './PlanView';
import { updateNodeStatus } from '@/lib/agent/planGenerator';
import { useEffect } from 'react';

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
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open and restore previous overflow when closed
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!plan) return null;

  const handleNodeStatusChange = (
    nodeId: string,
    status: 'not_started' | 'in_progress' | 'completed',
  ) => {
    const updatedPlan = updateNodeStatus(plan, nodeId, status);
    onUpdate?.(updatedPlan);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Side Sheet */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[600px] bg-background border-l border-border z-50 overflow-y-auto transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-sheet-title"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 id="plan-sheet-title" className="text-lg font-semibold">
            Learning Plan
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close plan view"
            title="Close (Esc)"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <PlanView plan={plan} onNodeStatusChange={handleNodeStatusChange} />
        </div>
      </div>
    </>
  );
}
