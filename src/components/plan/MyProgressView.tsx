'use client';
import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  SparklesIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel } from '@/lib/types';
import { TopicMasteryCard, TopicMasteryCardActions } from './TopicMasteryCard';
import { EditConfirmDialog, EditConfirmAction } from './EditConfirmDialog';

type FilterMode = 'all' | 'needs_work' | 'developing' | 'mastered' | 'misconceptions';

export function MyProgressView({
  plan,
  learnerModel,
  focusNodeId,
  onConfidenceAdjust,
  onMisconceptionResolve,
  onSetConfidenceFloor,
  onFlagForReview,
  onMarkKnown,
  compact,
}: {
  plan: LearningPlan;
  learnerModel?: LearnerModel;
  focusNodeId?: string;
  onConfidenceAdjust: (nodeId: string, newConfidence: number, reason?: string) => void;
  onMisconceptionResolve: (nodeId: string, misconceptionId: string) => void;
  onSetConfidenceFloor: (nodeId: string, floor: number) => void;
  onFlagForReview: (nodeId: string) => void;
  onMarkKnown: (nodeId: string) => void;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [pendingAction, setPendingAction] = useState<EditConfirmAction | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const masteryEntries = learnerModel ? Object.values(learnerModel.mastery || {}) : [];
    const totalInteractions = masteryEntries.reduce((acc, m) => acc + (m.interactions || 0), 0);
    const avgConfidence = masteryEntries.length
      ? masteryEntries.reduce((acc, m) => acc + (m.confidence || 0), 0) / masteryEntries.length
      : 0;
    const masteredTopics = masteryEntries.filter((m) => (m.confidence || 0) >= 0.7).length;
    const developingTopics = masteryEntries.filter(
      (m) => (m.confidence || 0) >= 0.4 && (m.confidence || 0) < 0.7,
    ).length;
    const needsWorkTopics = masteryEntries.filter((m) => (m.confidence || 0) < 0.4).length;
    const totalMisconceptions = masteryEntries.reduce(
      (acc, m) => acc + (m.misconceptions?.filter((mc) => !mc.resolved).length || 0),
      0,
    );

    return {
      totalInteractions,
      avgConfidence,
      masteredTopics,
      developingTopics,
      needsWorkTopics,
      totalMisconceptions,
      totalTopics: plan.nodes.length,
    };
  }, [learnerModel, plan.nodes.length]);

  // Filter topics
  const filteredNodes = useMemo(() => {
    return plan.nodes.filter((node) => {
      const mastery = learnerModel?.mastery?.[node.id];
      const confidence = mastery?.confidence ?? 0;
      const hasMisconceptions =
        (mastery?.misconceptions?.filter((m) => !m.resolved).length ?? 0) > 0;

      switch (filter) {
        case 'needs_work':
          return confidence < 0.4;
        case 'developing':
          return confidence >= 0.4 && confidence < 0.7;
        case 'mastered':
          return confidence >= 0.7;
        case 'misconceptions':
          return hasMisconceptions;
        default:
          return true;
      }
    });
  }, [plan.nodes, learnerModel, filter]);

  // Wrap actions with confirmation dialogs
  const createConfirmableAction = useCallback((action: EditConfirmAction, callback: () => void) => {
    setPendingAction(action);
    setPendingCallback(() => callback);
  }, []);

  const handleConfirm = useCallback(() => {
    pendingCallback?.();
    setPendingAction(null);
    setPendingCallback(null);
  }, [pendingCallback]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
    setPendingCallback(null);
  }, []);

  const actions: TopicMasteryCardActions = useMemo(
    () => ({
      onConfidenceAdjust: (nodeId, newConfidence, reason) => {
        const node = plan.nodes.find((n) => n.id === nodeId);
        const currentConfidence = learnerModel?.mastery?.[nodeId]?.confidence ?? 0;
        createConfirmableAction(
          {
            type: 'confidence_adjust',
            nodeId,
            nodeName: node?.name ?? nodeId,
            from: currentConfidence,
            to: newConfidence,
          },
          () => onConfidenceAdjust(nodeId, newConfidence, reason),
        );
      },
      onMisconceptionResolve: (nodeId, misconceptionId) => {
        const node = plan.nodes.find((n) => n.id === nodeId);
        const misconception = learnerModel?.mastery?.[nodeId]?.misconceptions?.find(
          (m) => m.id === misconceptionId,
        );
        createConfirmableAction(
          {
            type: 'misconception_resolve',
            nodeId,
            nodeName: node?.name ?? nodeId,
            misconceptionDesc: misconception?.description ?? 'Unknown misconception',
          },
          () => onMisconceptionResolve(nodeId, misconceptionId),
        );
      },
      onSetConfidenceFloor: (nodeId, floor) => {
        const node = plan.nodes.find((n) => n.id === nodeId);
        createConfirmableAction(
          {
            type: 'set_confidence_floor',
            nodeId,
            nodeName: node?.name ?? nodeId,
            floor,
          },
          () => onSetConfidenceFloor(nodeId, floor),
        );
      },
      onFlagForReview: (nodeId) => {
        const node = plan.nodes.find((n) => n.id === nodeId);
        createConfirmableAction(
          {
            type: 'flag_review',
            nodeId,
            nodeName: node?.name ?? nodeId,
          },
          () => onFlagForReview(nodeId),
        );
      },
      onMarkKnown: (nodeId) => {
        const node = plan.nodes.find((n) => n.id === nodeId);
        createConfirmableAction(
          {
            type: 'mark_known',
            nodeId,
            nodeName: node?.name ?? nodeId,
          },
          () => onMarkKnown(nodeId),
        );
      },
    }),
    [
      plan.nodes,
      learnerModel,
      createConfirmableAction,
      onConfidenceAdjust,
      onMisconceptionResolve,
      onSetConfidenceFloor,
      onFlagForReview,
      onMarkKnown,
    ],
  );

  const filterButtons: { id: FilterMode; label: string; count: number; color?: string }[] = [
    { id: 'all', label: 'All', count: plan.nodes.length },
    {
      id: 'needs_work',
      label: 'Needs work',
      count: stats.needsWorkTopics,
      color: 'var(--color-danger)',
    },
    {
      id: 'developing',
      label: 'Developing',
      count: stats.developingTopics,
      color: 'var(--color-accent-2)',
    },
    {
      id: 'mastered',
      label: 'Mastered',
      count: stats.masteredTopics,
      color: 'var(--color-success)',
    },
    {
      id: 'misconceptions',
      label: 'Misconceptions',
      count: stats.totalMisconceptions,
      color: 'var(--color-danger)',
    },
  ];

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {/* Global Stats Section (hidden in compact — SummaryStrip handles this) */}
      {!compact && (
        <section className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            className="p-3 space-y-1"
            style={{
              background: 'var(--marginalia-bg)',
              border: '1px solid var(--rule-light)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 'var(--radius-editorial)',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
              <SparklesIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              Mastery
            </div>
            <div className="text-xl font-bold text-foreground">
              {Math.round(stats.avgConfidence * 100)}%
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="p-3 space-y-1"
            style={{
              background: 'var(--marginalia-bg)',
              border: '1px solid var(--rule-light)',
              borderLeft: '2px solid var(--color-success)',
              borderRadius: 'var(--radius-editorial)',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircleIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
              Topics
            </div>
            <div className="text-xl font-bold text-foreground">
              {stats.masteredTopics}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                / {stats.totalTopics}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-3 space-y-1"
            style={{
              background: 'var(--marginalia-bg)',
              border: '1px solid var(--rule-light)',
              borderLeft: '2px solid var(--color-accent-2)',
              borderRadius: 'var(--radius-editorial)',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-2)' }} />
              Activity
            </div>
            <div className="text-xl font-bold text-foreground">
              {stats.totalInteractions}{' '}
              <span className="text-sm font-normal text-muted-foreground">interactions</span>
            </div>
          </motion.div>
        </section>
      )}

      {/* Misconceptions Alert */}
      {stats.totalMisconceptions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-3 p-3"
          style={{
            background: 'color-mix(in oklab, var(--color-danger) 10%, var(--marginalia-bg))',
            border: '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--rule-light))',
            borderLeft: '3px solid var(--color-danger)',
            borderRadius: 'var(--radius-editorial)',
          }}
        >
          <ExclamationTriangleIcon
            className="h-5 w-5 shrink-0"
            style={{ color: 'var(--color-danger)' }}
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-fg)' }}>
              {stats.totalMisconceptions} unresolved misconception
              {stats.totalMisconceptions === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground">
              Review and mark them as resolved when you understand the concepts correctly.
            </p>
          </div>
        </motion.div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FunnelIcon className="h-4 w-4 text-muted-foreground" />
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setFilter(btn.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all"
            style={{
              background: filter === btn.id ? 'var(--surface-paper)' : 'transparent',
              border:
                filter === btn.id ? '1px solid var(--rule-accent)' : '1px solid var(--rule-light)',
              borderRadius: 'var(--radius-editorial)',
              color: filter === btn.id ? (btn.color ?? 'var(--color-fg)') : 'var(--color-fg-muted)',
              boxShadow: filter === btn.id ? 'var(--shadow-1)' : 'none',
            }}
          >
            {btn.label}
            <span
              className="px-1 py-0.5 text-[10px] tabular-nums"
              style={{
                background: filter === btn.id ? 'var(--marginalia-bg)' : 'transparent',
                borderRadius: '4px',
              }}
            >
              {btn.count}
            </span>
          </button>
        ))}
      </div>

      {/* Topic Cards Grid */}
      <div className="space-y-3">
        {filteredNodes.length === 0 ? (
          <div
            className="p-6 text-center"
            style={{
              background: 'var(--marginalia-bg)',
              border: '1px dashed var(--rule-light)',
              borderRadius: 'var(--radius-editorial)',
            }}
          >
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'No topics in your learning plan yet.'
                : `No topics matching "${filterButtons.find((b) => b.id === filter)?.label}" filter.`}
            </p>
          </div>
        ) : (
          filteredNodes.map((node, idx) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * Math.min(idx, 10) }}
            >
              <TopicMasteryCard
                node={node}
                mastery={learnerModel?.mastery?.[node.id]}
                focused={focusNodeId === node.id}
                actions={actions}
              />
            </motion.div>
          ))
        )}
      </div>

      {/* Empty State for No Learning Data */}
      {!learnerModel && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 text-center"
          style={{
            background: 'var(--marginalia-bg)',
            border: '1px solid var(--rule-light)',
            borderRadius: 'var(--radius-editorial)',
          }}
        >
          <SparklesIcon className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--color-accent)' }} />
          <h3
            className="text-base font-semibold mb-1"
            style={{ fontFamily: 'var(--font-serif-assistant)' }}
          >
            No learning data yet
          </h3>
          <p className="text-sm text-muted-foreground">
            Start a lesson to begin tracking your progress and mastery of each topic.
          </p>
        </motion.div>
      )}

      {/* Confirmation Dialog */}
      <EditConfirmDialog
        isOpen={pendingAction !== null}
        action={pendingAction}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
