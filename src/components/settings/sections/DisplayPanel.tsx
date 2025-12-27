'use client';
// Component: DisplayPanel
// Responsibility: Display and Debug settings controls.

export function DisplayPanel(props: {
  showThinking: boolean;
  showStats: boolean;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  enableMultiModelChat: boolean;
  uiDebugMode: boolean;
  setShowThinking: (v: boolean) => void;
  setShowStats: (v: boolean) => void;
  setShowToolCallLog: (v: boolean) => void;
  setShowDebugRawJson: (v: boolean) => void;
  setEnableMultiModelChat: (v: boolean) => void;
  setDebugMode: (v: boolean) => void;
}) {
  const {
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
    enableMultiModelChat,
    uiDebugMode,
    setShowThinking,
    setShowStats,
    setShowToolCallLog,
    setShowDebugRawJson,
    setEnableMultiModelChat,
    setDebugMode,
  } = props;
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium text-muted-foreground">Display</div>
        <div className="space-y-1">
          <label className="text-sm block">Show thinking by default</label>
          <div className="segmented">
            <button
              className={`segment ${showThinking ? 'is-active' : ''}`}
              onClick={() => setShowThinking(true)}
            >
              On
            </button>
            <button
              className={`segment ${!showThinking ? 'is-active' : ''}`}
              onClick={() => setShowThinking(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Expand the reasoning panel automatically for new messages.
          </div>
        </div>
        <div className="soft-divider" />
        <div className="space-y-1">
          <label className="text-sm block">Show stats</label>
          <div className="segmented">
            <button
              className={`segment ${showStats ? 'is-active' : ''}`}
              onClick={() => setShowStats(true)}
            >
              On
            </button>
            <button
              className={`segment ${!showStats ? 'is-active' : ''}`}
              onClick={() => setShowStats(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Display model, timing, and cost info under messages.
          </div>
        </div>
        <div className="soft-divider" />
        <div className="space-y-1">
          <label className="text-sm block">Multi-model chat</label>
          <div className="segmented">
            <button
              className={`segment ${enableMultiModelChat ? 'is-active' : ''}`}
              onClick={() => setEnableMultiModelChat(true)}
            >
              On
            </button>
            <button
              className={`segment ${!enableMultiModelChat ? 'is-active' : ''}`}
              onClick={() => setEnableMultiModelChat(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Allow selecting and chatting with multiple models simultaneously in a multi-column
            layout.
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium text-muted-foreground">Debug</div>
        <div className="space-y-1">
          <label className="text-sm block">Enable debug view</label>
          <div className="segmented">
            <button
              className={`segment ${uiDebugMode ? 'is-active' : ''}`}
              onClick={() => setDebugMode(true)}
            >
              On
            </button>
            <button
              className={`segment ${!uiDebugMode ? 'is-active' : ''}`}
              onClick={() => setDebugMode(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Show a Debug panel under assistant messages with the exact request payload sent to
            OpenRouter.
          </div>
        </div>
        <div className="soft-divider" />
        <div className="space-y-1">
          <label className="text-sm block">Show tool call log</label>
          <div className="segmented">
            <button
              className={`segment ${showToolCallLog ? 'is-active' : ''}`}
              onClick={() => setShowToolCallLog(true)}
            >
              On
            </button>
            <button
              className={`segment ${!showToolCallLog ? 'is-active' : ''}`}
              onClick={() => setShowToolCallLog(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Include structured tool activity inside the debug panel for each assistant turn.
          </div>
        </div>
        <div className="soft-divider" />
        <div className="space-y-1">
          <label className="text-sm block">Show raw debug JSON</label>
          <div className="segmented">
            <button
              className={`segment ${showDebugRawJson ? 'is-active' : ''}`}
              onClick={() => setShowDebugRawJson(true)}
            >
              On
            </button>
            <button
              className={`segment ${!showDebugRawJson ? 'is-active' : ''}`}
              onClick={() => setShowDebugRawJson(false)}
            >
              Off
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            When off, hide the raw request JSON block to keep the debug panel concise.
          </div>
        </div>
      </div>
    </div>
  );
}
