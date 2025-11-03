'use client';

import { useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import type { ToolCallLogEntry } from '@/lib/types';
import { ToolCallLog } from '@/components/message/ToolCallLog';

type SummaryItem = { label: string; value: string };
type MessageDescriptor = { key: string; role: string; snippet: string; toolCalls?: string[] };

function formatNumber(value: unknown): string | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

function coerceBooleanLabel(value: unknown, trueLabel: string, falseLabel?: string): string | undefined {
  if (value === true) return trueLabel;
  if (value === false && falseLabel) return falseLabel;
  return undefined;
}

function extractContentSnippet(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as any).text === 'string')
          return (part as any).text;
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (typeof content === 'object') {
    if (typeof (content as any).text === 'string') return (content as any).text.trim();
    if (Array.isArray((content as any).content)) return extractContentSnippet((content as any).content);
  }
  return '';
}

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
  if (!hasBody && !hasToolCalls) return null;

  const parsed = useMemo(() => {
    if (!hasBody) return null;
    try {
      const json = JSON.parse(body!);
      return json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [body, hasBody]);

  const summaryItems = useMemo<SummaryItem[]>(() => {
    if (!parsed) return [];
    const payload = parsed as Record<string, any>;
    const items: SummaryItem[] = [];
    if (typeof payload.model === 'string' && payload.model) {
      items.push({ label: 'Model', value: payload.model });
    }
    const temperature = formatNumber(payload.temperature);
    if (temperature) items.push({ label: 'Temperature', value: temperature });
    const topP = formatNumber(payload.top_p);
    if (topP) items.push({ label: 'Top P', value: topP });
    const maxTokens = formatNumber(payload.max_tokens);
    if (maxTokens) items.push({ label: 'Max tokens', value: maxTokens });
    if (payload.reasoning && typeof payload.reasoning === 'object') {
      const effort = (payload.reasoning as any).effort;
      if (typeof effort === 'string' && effort !== 'none') {
        items.push({ label: 'Reasoning effort', value: effort });
      }
      const reasoningTokens = formatNumber((payload.reasoning as any).max_tokens);
      if (reasoningTokens) {
        items.push({ label: 'Reasoning tokens', value: reasoningTokens });
      }
    }
    if (Array.isArray(payload.tools) && payload.tools.length) {
      items.push({ label: 'Tools', value: `${payload.tools.length}` });
    }
    if (typeof payload.stream === 'boolean') {
      items.push({ label: 'Streaming', value: payload.stream ? 'On' : 'Off' });
    }
    const parallelLabel = coerceBooleanLabel(payload.parallel_tool_calls, 'Enabled', 'Disabled');
    if (parallelLabel) {
      items.push({ label: 'Parallel tool calls', value: parallelLabel });
    }
    const usageRequested =
      payload.stream_options && typeof payload.stream_options === 'object'
        ? coerceBooleanLabel((payload.stream_options as any).include_usage, 'Usage in stream')
        : undefined;
    if (usageRequested) {
      items.push({ label: 'Token usage', value: usageRequested });
    }
    if (Array.isArray(payload.modalities) && payload.modalities.length) {
      const list = payload.modalities
        .filter((value: unknown): value is string => typeof value === 'string')
        .join(', ');
      if (list) items.push({ label: 'Modalities', value: list });
    }
    if (payload.provider && typeof payload.provider === 'object') {
      const sort = (payload.provider as any).sort;
      if (typeof sort === 'string') items.push({ label: 'Provider sort', value: sort });
    }
    return items;
  }, [parsed]);

  const toolNames = useMemo<string[]>(() => {
    if (!parsed) return [];
    const raw = Array.isArray((parsed as any).tools) ? ((parsed as any).tools as unknown[]) : [];
    const names = raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return undefined;
        const fn = (entry as any).function;
        if (fn && typeof fn === 'object' && typeof (fn as any).name === 'string') {
          return (fn as any).name as string;
        }
        if (typeof (entry as any).name === 'string') return (entry as any).name as string;
        return undefined;
      })
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    return Array.from(new Set(names));
  }, [parsed]);

  const pluginNames = useMemo<string[]>(() => {
    if (!parsed) return [];
    const plugins = Array.isArray((parsed as any).plugins)
      ? ((parsed as any).plugins as unknown[])
      : [];
    return plugins
      .map((plugin) => {
        if (plugin && typeof plugin === 'object' && typeof (plugin as any).id === 'string') {
          return (plugin as any).id as string;
        }
        return undefined;
      })
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }, [parsed]);

  const messageItems = useMemo<MessageDescriptor[]>(() => {
    if (!parsed) return [];
    const messages = Array.isArray((parsed as any).messages)
      ? ((parsed as any).messages as unknown[])
      : [];
    const items: MessageDescriptor[] = [];
    messages.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const role =
        typeof (entry as any).role === 'string' ? ((entry as any).role as string) : `message ${index + 1}`;
      const snippetRaw = extractContentSnippet((entry as any).content);
      const snippet = snippetRaw || '';
      const toolCallsRaw = Array.isArray((entry as any).tool_calls)
        ? ((entry as any).tool_calls as unknown[])
        : undefined;
      const toolCallsNames = toolCallsRaw
        ? toolCallsRaw
            .map((call) => {
              if (!call || typeof call !== 'object') return undefined;
              const fn = (call as any).function;
              if (fn && typeof fn === 'object' && typeof (fn as any).name === 'string') {
                return (fn as any).name as string;
              }
              return undefined;
            })
            .filter((name): name is string => typeof name === 'string' && name.length > 0)
        : undefined;
      const descriptor: MessageDescriptor = {
        key: `${index}-${role}`,
        role,
        snippet,
        ...(toolCallsNames && toolCallsNames.length ? { toolCalls: toolCallsNames } : {}),
      };
      items.push(descriptor);
    });
    return items;
  }, [parsed]);

  const rawJson = useMemo(() => {
    if (!hasBody || !showRawJson) return '';
    if (!parsed) return body ?? '';
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body ?? '';
    }
  }, [body, hasBody, parsed, showRawJson]);

  const headerLabel = hasBody ? 'Debug request' : 'Tool activity';
  const canCopyRaw = expanded && showRawJson && hasBody && rawJson;

  return (
    <div className="px-4 pt-3">
      <div className="thinking-panel">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">{headerLabel}</div>
          <div className="flex items-center gap-1">
            {canCopyRaw && (
              <button
                className="icon-button"
                aria-label="Copy request"
                title="Copy request"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rawJson);
                  } catch {}
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
          <div className="space-y-3 text-xs leading-relaxed">
            {summaryItems.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Overview
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded bg-muted/40 px-2 py-1.5"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="font-medium text-foreground">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolNames.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Tool definitions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {toolNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pluginNames.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Plugins
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pluginNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {messageItems.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Messages
                </div>
                <ol className="space-y-2">
                  {messageItems.map((msg, index) => (
                    <li
                      key={msg.key}
                      className="rounded border border-border px-2 py-1.5 bg-background"
                    >
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{msg.role}</span>
                        <span>#{index + 1}</span>
                      </div>
                      {msg.snippet ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-foreground">
                          {msg.snippet}
                        </div>
                      ) : (
                        <div className="mt-1 italic text-muted-foreground">No visible content</div>
                      )}
                      {msg.toolCalls && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Raw request JSON
                </div>
                <pre className="whitespace-pre-wrap text-xs opacity-90 leading-relaxed bg-muted/30 rounded p-2 overflow-x-auto">
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
