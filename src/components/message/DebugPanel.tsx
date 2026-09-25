import { useId, useMemo } from 'react';
import {
  ChevronDownIcon,
  CodeBracketIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type { ToolCallLogEntry } from '@/lib/types';
import { ToolCallLog } from '@/components/message/ToolCallLog';
import { parseDebugBody } from '@/lib/agent/debug/parseDebugBody';
import { CopyButton } from '@/components/markdown/CopyButton';

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
  const bodyId = useId();
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
  const Glyph = hasBody ? CodeBracketIcon : WrenchScrewdriverIcon;

  return (
    <section className="devtools">
      <button
        type="button"
        className="devtools__toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <Glyph className="devtools__glyph" aria-hidden="true" />
        <span className="devtools__title">{headerLabel}</span>
        <span className="devtools__rule" aria-hidden="true" />
        <ChevronDownIcon
          className={`devtools__chevron${expanded ? ' is-open' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={bodyId} className="devtools__body">
          {summaryItems.length > 0 && (
            <div>
              <div className="devtools__section-head">
                <span className="devtools__label">Overview</span>
              </div>
              <dl className="devtools__facts">
                {summaryItems.map((item) => (
                  <div key={item.label} className="contents">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {toolNames.length > 0 && (
            <div>
              <div className="devtools__section-head">
                <span className="devtools__label">Tool definitions</span>
              </div>
              <ul className="devtools__names">
                {toolNames.map((name) => (
                  <li key={name} className="devtools__name">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pluginNames.length > 0 && (
            <div>
              <div className="devtools__section-head">
                <span className="devtools__label">Plugins</span>
              </div>
              <ul className="devtools__names">
                {pluginNames.map((name) => (
                  <li key={name} className="devtools__name">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messageItems.length > 0 && (
            <div>
              <div className="devtools__section-head">
                <span className="devtools__label">Messages</span>
              </div>
              <ol className="devtools__messages">
                {messageItems.map((msg, index) => (
                  <li key={msg.key}>
                    <div className="devtools__message-head">
                      <span>{msg.role}</span>
                      <span className="devtools__message-index">#{index + 1}</span>
                    </div>
                    {msg.snippet ? (
                      <p className="devtools__quote">{msg.snippet}</p>
                    ) : (
                      <p className="devtools__note">No visible content</p>
                    )}
                    {msg.toolCalls && (
                      <p className="devtools__note">Tool calls: {msg.toolCalls.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* The log heads itself ("Tool calls (3)"), so it takes no label here. */}
          {hasToolCalls && (
            <ToolCallLog
              toolCalls={toolCalls!}
              mode="full"
              collapsible={false}
              defaultExpanded
              highlightRecent={highlightToolCalls}
            />
          )}

          {showRawJson && hasBody && rawJson && (
            <div>
              <div className="devtools__section-head">
                <span className="devtools__label">Raw request JSON</span>
                <CopyButton
                  text={rawJson}
                  label="Copy request"
                  className="icon-button icon-button--sm"
                />
              </div>
              <pre className="devtools__code devtools__code--wrap">{rawJson}</pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
