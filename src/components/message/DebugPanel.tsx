'use client';
import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

type MemoryDebugInfo = {
  enabled: boolean;
  defaultEnabled?: boolean;
  version?: number;
  messageCount?: number;
  after?: string;
  before?: string;
  raw?: string;
  conversationWindow?: string;
  model?: string;
  updatedAt?: number;
};

export function DebugPanel({
  body,
  expanded,
  onToggle,
  memoryInfo,
  onToggleMemory,
}: {
  body: string;
  expanded: boolean;
  onToggle: () => void;
  memoryInfo?: MemoryDebugInfo;
  onToggleMemory?: () => void | Promise<void>;
}) {
  if (!body) return null;
  const [memoryBusy, setMemoryBusy] = useState(false);
  const handleMemoryToggle = async () => {
    if (!onToggleMemory || memoryBusy) return;
    try {
      setMemoryBusy(true);
      await onToggleMemory();
    } finally {
      setMemoryBusy(false);
    }
  };
  return (
    <div className="px-4 pt-3">
      <div className="thinking-panel">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">Debug request</div>
          <div className="flex items-center gap-1">
            {memoryInfo && (
              <button
                className={`btn btn-xs ${memoryInfo.enabled ? 'btn-primary' : 'btn-outline'}`}
                onClick={handleMemoryToggle}
                disabled={!onToggleMemory || memoryBusy}
                title={memoryInfo.defaultEnabled ? 'Defaults to on' : 'Defaults to off'}
              >
                {memoryInfo.enabled ? 'Updating Memory: On' : 'Updating Memory: Off'}
              </button>
            )}
            {expanded && (
              <button
                className="icon-button"
                aria-label="Copy request"
                title="Copy request"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(body);
                  } catch {}
                }}
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={expanded ? 'Hide request' : 'Show request'}
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
          <>
            <pre className="whitespace-pre-wrap text-xs opacity-90 leading-relaxed mb-3">
              {body}
            </pre>
            {memoryInfo && (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>Status: {memoryInfo.enabled ? 'Updating' : 'Paused'}</span>
                  {typeof memoryInfo.messageCount === 'number' && (
                    <span>Messages since update: {memoryInfo.messageCount}</span>
                  )}
                  {typeof memoryInfo.version === 'number' && (
                    <span>Version: {memoryInfo.version}</span>
                  )}
                  {memoryInfo.model && <span>Model: {memoryInfo.model}</span>}
                  {memoryInfo.updatedAt && (
                    <span>
                      Updated:{' '}
                      {new Date(memoryInfo.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                {memoryInfo.after && (
                  <div>
                    <div className="text-muted-foreground font-medium">Current memory snapshot</div>
                    <pre className="mt-1 whitespace-pre-wrap text-xs opacity-90 leading-relaxed border border-border rounded-md p-2">
                      {memoryInfo.after}
                    </pre>
                  </div>
                )}
                {memoryInfo.before && memoryInfo.before !== memoryInfo.after && (
                  <details className="border border-border/60 rounded-md p-2">
                    <summary className="cursor-pointer text-muted-foreground font-medium">
                      Previous memory
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80 leading-relaxed">
                      {memoryInfo.before}
                    </pre>
                  </details>
                )}
                {memoryInfo.conversationWindow && (
                  <details className="border border-border/60 rounded-md p-2">
                    <summary className="cursor-pointer text-muted-foreground font-medium">
                      Last analysis window
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80 leading-relaxed">
                      {memoryInfo.conversationWindow}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
