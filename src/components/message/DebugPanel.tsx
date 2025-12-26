'use client';

import { useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import type { ToolCallLogEntry } from '@/lib/types';
import { ToolCallLog } from '@/components/message/ToolCallLog';
import { logger } from '@/lib/logger';
import { parseDebugBody } from '@/lib/agent/debug/parseDebugBody';

export function DebugPanel({
  body,
  toolCalls,
  showToolCalls = false,
  showRawJson = true,
  highlightToolCalls = false,
  expanded,
  onToggle,
}: {
  body?: string;
  toolCalls?: ToolCallLogEntry[];
  showToolCalls?: boolean;
  showRawJson?: boolean;
  highlightToolCalls?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasBody = typeof body === 'string' && body.trim().length > 0;
  const hasToolCalls = showToolCalls && Array.isArray(toolCalls) && toolCalls.length > 0;

  const parsed = useMemo(
    () => (hasBody ? parseDebugBody(body, { includeRawJson: showRawJson }) : null),
    [body, hasBody, showRawJson],
  );
  const summaryItems = parsed?.summaryItems ?? [];
  const toolNames = parsed?.toolNames ?? [];
  const pluginNames = parsed?.pluginNames ?? [];
  const messageItems = parsed?.messageItems ?? [];
  const rawJson = parsed?.rawJson ?? '';

  if (!hasBody && !hasToolCalls) return null;

  const headerLabel = hasBody ? 'Debug request' : 'Tool activity';
  const canCopyRaw = expanded && showRawJson && hasBody && rawJson;

  return (
    <div className="mt-4 mb-2">
      <div className="marginalia">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
            {headerLabel}
          </div>
          <div className="flex items-center gap-1">
            {canCopyRaw && (
              <button
                className="icon-button"
                aria-label="Copy request"
                title="Copy request"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rawJson);
                  } catch (error) {
                    logger.error('Unable to copy raw request', error);
                  }
                }}
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={expanded ? 'Hide debug view' : 'Show debug view'}
              onClick={onToggle}
              aria-pressed={expanded}
            >
              {expanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        {expanded && (
          <div className="space-y-4 text-xs leading-relaxed pt-2 border-t border-[var(--rule-light)]">
            {summaryItems.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Overview
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[var(--radius-editorial)] bg-[var(--color-muted)]/40 px-3 py-2 border border-[var(--color-border)]/30"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                        {item.label}
                      </div>
                      <div className="font-medium text-[var(--color-fg)]">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolNames.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Tool definitions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {toolNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pluginNames.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Plugins
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pluginNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {messageItems.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Messages
                </div>
                <ol className="space-y-2">
                  {messageItems.map((msg, index) => (
                    <li
                      key={msg.key}
                      className="rounded-[var(--radius-editorial)] border border-[var(--color-border)] px-3 py-2 bg-[var(--color-surface)]"
                    >
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                        <span>{msg.role}</span>
                        <span>#{index + 1}</span>
                      </div>
                      {msg.snippet ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-[var(--color-fg)]">
                          {msg.snippet}
                        </div>
                      ) : (
                        <div className="mt-1 italic text-[var(--color-fg-muted)]">
                          No visible content
                        </div>
                      )}
                      {msg.toolCalls && (
                        <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
                          Tool calls: {msg.toolCalls.join(', ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {hasToolCalls && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Tool calls
                </div>
                <ToolCallLog
                  toolCalls={toolCalls!}
                  mode="full"
                  collapsible={false}
                  defaultExpanded
                  highlightRecent={highlightToolCalls}
                  className="my-2"
                />
              </div>
            )}

            {showRawJson && hasBody && rawJson && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                  Raw request JSON
                </div>
                <pre className="whitespace-pre-wrap text-xs opacity-90 leading-relaxed bg-[var(--color-muted)]/30 rounded-[var(--radius-editorial)] p-3 overflow-x-auto border border-[var(--color-border)]/30 font-mono">
                  {rawJson}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
