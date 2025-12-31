'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  SparklesIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import type { TopicMastery, LearningPlanNode, Misconception } from '@/lib/types';
import { ConfidenceSlider } from './ConfidenceSlider';
import { EvidenceTimeline } from './EvidenceTimeline';

function getConfidenceColor(value: number): string {
  if (value >= 0.7) return 'var(--color-success)';
  if (value >= 0.4) return 'var(--color-accent-2)';
  return 'var(--color-danger)';
}

export type TopicMasteryCardActions = {
  onConfidenceAdjust: (nodeId: string, newConfidence: number, reason?: string) => void;
  onMisconceptionResolve: (nodeId: string, misconceptionId: string) => void;
  onSetConfidenceFloor: (nodeId: string, floor: number) => void;
  onFlagForReview: (nodeId: string) => void;
  onMarkKnown: (nodeId: string) => void;
};

export function TopicMasteryCard({
  node,
  mastery,
  focused,
  actions,
}: {
  node: LearningPlanNode;
  mastery?: TopicMastery;
  focused?: boolean;
  actions: TopicMasteryCardActions;
}) {
  const [expanded, setExpanded] = useState(focused ?? false);
  const [editingConfidence, setEditingConfidence] = useState(false);
  const [pendingConfidence, setPendingConfidence] = useState<number | null>(null);

  const confidence = mastery?.confidence ?? 0;
  const displayConfidence = pendingConfidence ?? confidence;
  const confidencePercent = Math.round(displayConfidence * 100);
  const color = getConfidenceColor(displayConfidence);

  const unresolvedMisconceptions = mastery?.misconceptions?.filter((m) => !m.resolved) ?? [];
  const hasMisconceptions = unresolvedMisconceptions.length > 0;

  const handleConfidenceChange = useCallback((value: number) => {
    setPendingConfidence(value);
  }, []);

  const handleConfidenceCommit = useCallback(
    (value: number) => {
      if (Math.abs(value - confidence) > 0.01) {
        actions.onConfidenceAdjust(node.id, value, 'User adjusted confidence manually');
      }
      setPendingConfidence(null);
      setEditingConfidence(false);
    },
    [node.id, confidence, actions],
  );

  const handleMisconceptionResolve = useCallback(
    (misconception: Misconception) => {
      actions.onMisconceptionResolve(node.id, misconception.id);
    },
    [node.id, actions],
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="overflow-hidden"
      style={{
        background: 'var(--surface-paper)',
        border: focused ? '2px solid var(--color-accent)' : '1px solid var(--rule-light)',
        borderRadius: 'var(--radius-editorial)',
        boxShadow: focused ? '0 0 0 3px var(--focus-ring)' : 'var(--shadow-1)',
      }}
    >
      {/* Header (always visible) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left focus-visible:outline-none"
      >
        <div className="p-4">
          {/* Title Row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  className="font-semibold text-sm truncate"
                  style={{
                    color: 'var(--color-fg)',
                    fontFamily: 'var(--font-serif-assistant)',
                  }}
                >
                  {node.name}
                </h3>
                {confidence >= 0.8 && (
                  <SparklesIcon
                    className="h-4 w-4 shrink-0"
                    style={{ color: 'var(--color-accent)' }}
                  />
                )}
              </div>

              {/* Stats Row */}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{mastery?.interactions ?? 0} interactions</span>
                {node.status === 'completed' && (
                  <span className="flex items-center gap-1">
                    <CheckCircleIcon className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
                    Completed
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Misconception Badge */}
              {hasMisconceptions && (
                <div
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium"
                  style={{
                    background: 'color-mix(in oklab, var(--color-danger) 12%, var(--surface-paper))',
                    border: '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--rule-light))',
                    borderRadius: 'var(--radius-editorial)',
                    color: 'var(--color-danger)',
                  }}
                >
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  {unresolvedMisconceptions.length}
                </div>
              )}

              {/* Expand Arrow */}
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              </motion.div>
            </div>
          </div>

          {/* Confidence Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Confidence</span>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color, fontFamily: 'var(--font-mono)' }}
              >
                {confidencePercent}%
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden"
              style={{
                background: 'var(--rule-light)',
                borderRadius: 'var(--radius-editorial)',
              }}
            >
              <motion.div
                className="h-full"
                initial={{ width: 0 }}
                animate={{ width: `${confidencePercent}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                  background: `linear-gradient(90deg,
                    color-mix(in oklab, ${color} 60%, var(--color-accent)) 0%,
                    ${color} 100%)`,
                  borderRadius: 'var(--radius-editorial)',
                }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-0 space-y-4"
              style={{ borderTop: '1px solid var(--rule-light)' }}
            >
              {/* Description */}
              {node.description && (
                <p
                  className="text-xs leading-relaxed pt-3"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {node.description}
                </p>
              )}

              {/* Confidence Slider Section */}
              <div
                className="p-3"
                style={{
                  background: 'var(--marginalia-bg)',
                  borderRadius: 'var(--radius-editorial)',
                  border: '1px solid var(--rule-light)',
                }}
              >
                {editingConfidence ? (
                  <div className="space-y-3">
                    <ConfidenceSlider
                      value={displayConfidence}
                      onChange={handleConfidenceChange}
                      onChangeEnd={handleConfidenceCommit}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setPendingConfidence(null);
                          setEditingConfidence(false);
                        }}
                        className="px-3 py-1.5 text-[11px] font-medium"
                        style={{
                          color: 'var(--color-fg-muted)',
                          border: '1px solid var(--rule-light)',
                          borderRadius: 'var(--radius-editorial)',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleConfidenceCommit(displayConfidence)}
                        className="px-3 py-1.5 text-[11px] font-medium"
                        style={{
                          color: '#0b0b0b',
                          background: 'var(--color-accent)',
                          borderRadius: 'var(--radius-editorial)',
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Your confidence
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span
                          className="text-xl font-bold tabular-nums"
                          style={{ color, fontFamily: 'var(--font-mono)' }}
                        >
                          {confidencePercent}
                        </span>
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingConfidence(true);
                      }}
                      className="px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      style={{
                        color: 'var(--color-fg)',
                        border: '1px solid var(--rule-light)',
                        borderRadius: 'var(--radius-editorial)',
                      }}
                    >
                      Edit confidence
                    </button>
                  </div>
                )}
              </div>

              {/* Misconceptions List */}
              {hasMisconceptions && (
                <div className="space-y-2">
                  <h4
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Misconceptions ({unresolvedMisconceptions.length})
                  </h4>
                  <div className="space-y-2">
                    {unresolvedMisconceptions.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start justify-between gap-2 p-3"
                        style={{
                          background: 'color-mix(in oklab, var(--color-danger) 8%, var(--surface-paper))',
                          border: '1px solid color-mix(in oklab, var(--color-danger) 25%, var(--rule-light))',
                          borderRadius: 'var(--radius-editorial)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: 'var(--color-fg)' }}
                          >
                            {m.description}
                          </p>
                          <span className="mt-1 text-[10px] text-muted-foreground">
                            Seen {m.occurrences}x
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMisconceptionResolve(m);
                          }}
                          className="shrink-0 px-2 py-1 text-[10px] font-medium transition-colors"
                          style={{
                            color: 'var(--color-success)',
                            border: '1px solid var(--color-success)',
                            borderRadius: 'var(--radius-editorial)',
                          }}
                        >
                          Mark resolved
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Timeline */}
              {mastery && mastery.evidence.length > 0 && (
                <EvidenceTimeline evidence={mastery.evidence} maxItems={5} />
              )}

              {/* Quick Actions */}
              <div
                className="flex flex-wrap gap-2 pt-2"
                style={{ borderTop: '1px solid var(--rule-light)' }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onMarkKnown(node.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    color: 'var(--color-fg)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  I know this
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onSetConfidenceFloor(node.id, 0.7);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    color: 'var(--color-fg)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  Set 70% floor
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onFlagForReview(node.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    color: 'var(--color-accent-2)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  <FlagIcon className="h-3.5 w-3.5" />
                  Need more practice
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
