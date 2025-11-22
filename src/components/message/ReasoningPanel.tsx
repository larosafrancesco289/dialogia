'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { Markdown } from '@/lib/markdown';
import { DeepResearchTimeline, type DeepResearchEvent } from './DeepResearchTimeline';

type ReasoningPanelProps = {
  reasoning: string;
  expanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
};

export function ReasoningPanel({
  reasoning,
  expanded,
  onToggle,
  isStreaming = false,
}: ReasoningPanelProps) {
  const hasReasoning = !!(reasoning && reasoning.trim().length > 0);

  // Try to parse deep research trace
  const trace = useMemo(() => {
    if (!hasReasoning) return null;
    try {
      const parsed = JSON.parse(reasoning);
      return Array.isArray(parsed) ? (parsed as DeepResearchEvent[]) : null;
    } catch {
      return null;
    }
  }, [reasoning, hasReasoning]);

  const isDeepResearch = !!trace;

  const bodyId = useId();
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevStreamingRef = useRef<boolean>(isStreaming);
  const throttledRef = useRef(0);

  const previewText = useMemo(() => {
    if (isDeepResearch && trace && trace.length > 0) {
      const last = trace[trace.length - 1];
      if (last.type === 'thought') return last.output || 'Thinking...';
      if (last.type === 'search') return `Searching: ${last.input?.query || ''}`;
      if (last.type === 'fetch') return `Reading: ${last.input?.url || ''}`;
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
  }, [hasReasoning, reasoning, isStreaming, isDeepResearch, trace]);

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

  const handleCopy = async () => {
    if (!hasReasoning) return;
    try {
      await navigator.clipboard.writeText(reasoning);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Failed to copy reasoning', error);
    }
  };

  if (!hasReasoning && !isStreaming) return null;

  return (
    <div className="px-4 pt-3">
      <div
        className={`thinking-panel reasoning-shell ${expanded ? 'is-open' : 'is-collapsed'} ${
          isStreaming ? 'is-streaming' : 'is-idle'
        } ${pulse ? 'is-fresh' : ''}`.trim()}
      >
        <button
          type="button"
          className="reasoning-trigger"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="reasoning-labels">
            <span className="reasoning-title">
              {isDeepResearch ? 'Deep Research' : 'Thinking'}
            </span>
            <span className={`reasoning-status ${isStreaming ? 'is-live' : ''}`}>
              {isStreaming
                ? isDeepResearch ? 'Researching...' : 'Reasoning in progress'
                : expanded
                  ? 'Hide details'
                  : 'View process'}
            </span>
            <span
              className={`reasoning-subtitle reasoning-preview ${isStreaming ? 'is-live' : ''}`}
              aria-live={isStreaming ? 'polite' : undefined}
            >
              <span className="reasoning-preview__text">{displayPreview}</span>
              {isStreaming && <span className="reasoning-caret" aria-hidden />}
            </span>
          </span>
          <span className="reasoning-chevron" aria-hidden>
            <ChevronDownIcon className="h-4 w-4" />
          </span>
        </button>
        <div
          id={bodyId}
          className={`reasoning-body ${expanded ? 'is-visible' : ''}`.trim()}
          hidden={!expanded}
        >
          <div className="reasoning-scroll">
            {isDeepResearch && trace ? (
              <DeepResearchTimeline trace={trace} />
            ) : hasReasoning ? (
              <div className="reasoning-text">
                <Markdown content={reasoning} />
              </div>
            ) : (
              <div className="reasoning-loader" role="status" aria-live="polite">
                <div className="reasoning-loader__bar" />
                <div className="reasoning-loader__bar" />
                <div className="reasoning-loader__bar" />
              </div>
            )}
          </div>
          {!isDeepResearch && hasReasoning && (
            <button
              type="button"
              className="reasoning-copy icon-button"
              aria-label={copied ? 'Thinking copied' : 'Copy thinking'}
              title={copied ? 'Copied' : 'Copy thinking'}
              onClick={handleCopy}
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
