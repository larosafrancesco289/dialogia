'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ChevronDownIcon,
  DocumentDuplicateIcon,
  SparklesIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { Markdown } from '@/lib/markdown';
import { logger } from '@/lib/logger';
import { DeepResearchTimeline } from './DeepResearchTimeline';
import type { MessageDeepResearch } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

type ReasoningPanelProps = {
  reasoning: string;
  deepResearch?: MessageDeepResearch;
  expanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function ReasoningPanel({
  reasoning,
  deepResearch,
  expanded,
  onToggle,
  isStreaming = false,
}: ReasoningPanelProps) {
  const hasReasoning = !!(reasoning && reasoning.trim().length > 0);

  const trace = useMemo(() => {
    if (!deepResearch?.trace || deepResearch.trace.length === 0) return null;
    return deepResearch.trace;
  }, [deepResearch]);

  const filteredTrace = useMemo(() => {
    if (!trace || trace.length === 0) return null;
    let finalAnswerFound = false;

    const cleaned = trace.filter((item) => {
      if (item?.type !== 'thought') return true;

      // If we already found the start of the final answer, hide subsequent thought parts
      // assuming they are part of the answer being streamed.
      if (finalAnswerFound) return false;

      const output = typeof item.output === 'string' ? item.output.trim().toLowerCase() : '';
      if (!output) return true;

      const normalized = output
        .replace(/^#+\s*/, '')
        .replace(/^\*\*|^\*|^__|^_/, '')
        .trim();

      if (normalized.startsWith('final answer')) {
        finalAnswerFound = true;
        return false;
      }

      return true;
    });
    return cleaned.length > 0 ? cleaned : null;
  }, [trace]);

  const isDeepResearch = !!filteredTrace;

  const bodyId = useId();
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevStreamingRef = useRef<boolean>(isStreaming);
  const throttledRef = useRef(0);

  const previewText = useMemo(() => {
    if (isDeepResearch && filteredTrace && filteredTrace.length > 0) {
      const last = filteredTrace[filteredTrace.length - 1];
      if (last.type === 'thought') {
        return typeof last.output === 'string' ? last.output : 'Thinking...';
      }
      if (last.type === 'search') {
        const input = asRecord(last.input);
        return `Searching: ${getString(input?.query) || ''}`;
      }
      if (last.type === 'fetch') {
        const input = asRecord(last.input);
        return `Reading: ${getString(input?.url) || ''}`;
      }
      return 'Deep Research active...';
    }

    if (hasReasoning) {
      const trimmed = reasoning.trim().replace(/\s+/g, ' ');
      if (!isStreaming) {
        if (trimmed.length <= 160) return trimmed;
        const slice = trimmed.slice(0, 160);
        const lastSpace = slice.lastIndexOf(' ');
        return `${slice.slice(0, lastSpace > 110 ? lastSpace : 160)}…`;
      }
      if (trimmed.length <= 110) return trimmed;
      const tail = trimmed.slice(-110);
      return `…${tail.trimStart()}`;
    }
    if (isStreaming) return 'Reasoning stream in progress…';
    return 'Reasoning hidden — tap to reveal the full trace.';
  }, [hasReasoning, reasoning, isStreaming, isDeepResearch, filteredTrace]);

  const [displayPreview, setDisplayPreview] = useState(previewText);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayPreview(previewText);
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const minInterval = 480; // ms
    if (now - throttledRef.current >= minInterval) {
      throttledRef.current = now;
      setDisplayPreview(previewText);
    }
  }, [previewText, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    return () => {
      throttledRef.current = 0;
    };
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) return;
    setDisplayPreview(previewText);
  }, [isStreaming, previewText]);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = !!isStreaming;
    let tid: number | undefined;
    if (wasStreaming && !isStreaming && hasReasoning) {
      setPulse(true);
      tid = window.setTimeout(() => setPulse(false), 2200);
    }
    return () => {
      if (typeof tid === 'number') window.clearTimeout(tid);
    };
  }, [isStreaming, hasReasoning]);

  useEffect(() => {
    if (!expanded) setCopied(false);
  }, [expanded]);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!hasReasoning) return;
    try {
      await navigator.clipboard.writeText(reasoning);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      logger.error('Failed to copy reasoning', error);
    }
  };

  if (!hasReasoning && !isStreaming) return null;

  return (
    <div className="mt-4 mb-2">
      <motion.div
        layout
        initial={false}
        className={`marginalia relative overflow-hidden ${pulse ? 'ring-2 ring-[var(--color-accent)]/20' : ''} ${isStreaming ? 'border-[var(--color-accent)]/40' : ''}`}
      >
        {/* Streaming shimmer effect */}
        {isStreaming && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[var(--radius-editorial)]">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-accent)]/8 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          </div>
        )}

        <button
          type="button"
          className="w-full flex items-center gap-3 text-left relative z-10 group"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <div
            className={`rounded-full p-2 transition-all duration-300 ${
              isStreaming
                ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)] animate-pulse'
                : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] group-hover:bg-[var(--color-accent)]/20'
            }`}
          >
            {isDeepResearch ? (
              <CpuChipIcon className="w-5 h-5" />
            ) : (
              <SparklesIcon className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isStreaming
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]'
                } transition-colors`}
              >
                {isDeepResearch ? 'Deep Research' : 'Reasoning Process'}
              </span>
              {isStreaming && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-ping" />
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
              <span className="truncate opacity-80 group-hover:opacity-100 transition-opacity">
                {displayPreview}
              </span>
              {isStreaming && (
                <span className="w-1.5 h-4 bg-[var(--color-accent)]/50 animate-pulse rounded-sm" />
              )}
            </div>
          </div>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[var(--color-fg-muted)]/50 group-hover:text-[var(--color-fg)] transition-colors"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={bodyId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            >
              <div className="pt-4 relative">
                <div className="h-px w-full bg-[var(--rule-light)] mb-4" />

                <div className="max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[var(--color-border)]/50 scrollbar-track-transparent">
                  {isDeepResearch && filteredTrace ? (
                    <DeepResearchTimeline trace={filteredTrace} />
                  ) : hasReasoning ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-fg)]/90 leading-relaxed font-[var(--font-sans)]">
                      <Markdown content={reasoning} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[var(--color-fg-muted)] py-4">
                      <div className="flex gap-1">
                        <div
                          className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <div
                          className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <div
                          className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                      <span className="text-xs font-medium">Initializing process...</span>
                    </div>
                  )}
                </div>

                {!isDeepResearch && hasReasoning && (
                  <div className="absolute top-4 right-0">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm p-1.5"
                      onClick={handleCopy}
                      title={copied ? 'Copied' : 'Copy reasoning'}
                    >
                      {copied ? (
                        <span className="text-xs font-bold text-[var(--color-success)]">
                          Copied!
                        </span>
                      ) : (
                        <DocumentDuplicateIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
