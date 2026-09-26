import { useId, useMemo, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import type { MessageActivityItem, ToolCallLogEntry } from '@/lib/types';
import { copyText } from '@/lib/clipboard';
import {
  buildOrderedResponseActivity,
  summarizeActivity,
  type SearchSourcesData,
  type ToolActivityItem,
} from '@/lib/ui/responseActivity';
import { ActivityEntry } from '@/components/message/ActivityEntry';
import { SourcesEntry } from '@/components/message/SourcesEntry';
import { LogoMark } from '@/components/ui/LogoMark';
import { useRevealOnOpen } from '@/lib/hooks/useRevealOnOpen';

type ResponseContextPanelProps = {
  reasoning: string;
  toolCalls?: ToolCallLogEntry[];
  activity?: MessageActivityItem[];
  sources?: SearchSourcesData;
  expanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  provider?: 'Tavily' | 'OpenRouter';
};

export function ResponseContextPanel({
  reasoning,
  toolCalls = [],
  activity = [],
  sources,
  expanded,
  onToggle,
  isStreaming = false,
}: ResponseContextPanelProps) {
  const bodyId = useId();
  const revealClass = useRevealOnOpen(expanded);
  const [copied, setCopied] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const hasReasoning = reasoning.trim().length > 0;
  const sortedToolCalls = useMemo(
    () => [...toolCalls].sort((a, b) => a.timestamp - b.timestamp),
    [toolCalls],
  );
  const sourceItems = sources?.results ?? [];
  const hasSources = sourceItems.length > 0;
  const isSearching = sources?.status === 'loading';
  const hasSearchError = sources?.status === 'error';
  const orderedActivity = useMemo(
    () =>
      buildOrderedResponseActivity({ activity, reasoning, toolCalls: sortedToolCalls, sources }),
    [activity, reasoning, sortedToolCalls, sources],
  );
  const toolItems = orderedActivity.filter(
    (item): item is ToolActivityItem => item.type === 'tool_call',
  );
  const visibleToolCount = toolItems.length;
  const hasToolCalls = visibleToolCount > 0;
  const hasActivity = orderedActivity.length > 0;

  const latestActivity = orderedActivity[orderedActivity.length - 1];
  const toolRunning =
    isSearching ||
    sortedToolCalls.some((call) => call.status === 'pending') ||
    toolItems.some((item) => item.status === 'pending');
  // Live only while the model is still at work: thinking, or waiting on a
  // tool. Once the answer begins below, the line comes to rest.
  const isLive =
    isStreaming &&
    (toolRunning ||
      !latestActivity ||
      (latestActivity.type === 'reasoning' && latestActivity.status !== 'done'));

  // Opened while the model is at work: the mark is already where the reply
  // waited, and the words fade in beside it (once; later phases do not replay).
  const [arrivedLive] = useState(isLive);

  const summary = summarizeActivity({
    orderedActivity,
    toolCalls: sortedToolCalls,
    reasoning,
    sources,
    isLive,
  });

  if (
    !hasReasoning &&
    !hasToolCalls &&
    !hasActivity &&
    !hasSources &&
    !isSearching &&
    !hasSearchError &&
    !isStreaming
  )
    return null;

  const copyReasoning = async () => {
    if (!hasReasoning) return;
    if (!(await copyText(reasoning))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const showSourcesEntry = hasSources || isSearching || hasSearchError;
  // The label names the phase: "Reasoning" only while the model is at it,
  // then what it came to ("Thought for 8 seconds", "Used 1 search").
  const hasThought = hasReasoning || orderedActivity.some((item) => item.type === 'reasoning');
  const title = isLive ? 'Reasoning' : hasThought ? 'Thought' : 'Used';

  return (
    <section
      className={`response-ledger${isLive ? ' is-live' : ''}${arrivedLive ? ' is-arriving' : ''}`}
    >
      <div className="response-ledger__head">
        <button
          type="button"
          className="response-ledger__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <LogoMark className="response-ledger__mark" live={isLive} />
          <span className="response-ledger__label">
            <span className="response-ledger__title">{title}</span>
            {summary && (
              // Keyed while live so each new line of thought fades in.
              <span key={isLive ? summary : 'rest'} className="response-ledger__summary">
                {summary}
              </span>
            )}
          </span>
          {hasSearchError && !expanded && (
            <span className="response-ledger__error">
              <ExclamationCircleIcon className="h-3.5 w-3.5" />
              Search failed
            </span>
          )}
          <span className="response-ledger__rule" aria-hidden="true" />
          <ChevronDownIcon className={`response-ledger__chevron${expanded ? ' is-open' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className={revealClass}>
          <div>
            <div id={bodyId} className="response-ledger__timeline">
              {orderedActivity.map((item) => (
                <ActivityEntry key={item.id} item={item} />
              ))}

              {!hasActivity && isStreaming && (
                <div className="response-ledger__entry">
                  <span className="response-ledger__entry-bead" aria-hidden="true" />
                  <p className="response-ledger__thought">
                    <span className="response-ledger__pulse" aria-hidden="true" /> Thinking…
                  </p>
                </div>
              )}

              {showSourcesEntry && (
                <SourcesEntry
                  sources={sources}
                  open={sourcesOpen}
                  onToggle={() => setSourcesOpen((value) => !value)}
                />
              )}
            </div>
            {/* Copy sits at the foot of the opened reasoning, not in the head,
                so opening the line never moves its chevron from under the pointer. */}
            {hasReasoning && (
              <div className="response-ledger__foot">
                <button
                  type="button"
                  className={`response-ledger__copy${copied ? ' is-success' : ''}`}
                  aria-label={copied ? 'Copied' : 'Copy reasoning'}
                  title={copied ? 'Copied' : 'Copy reasoning'}
                  onClick={copyReasoning}
                >
                  {copied ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ClipboardIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
