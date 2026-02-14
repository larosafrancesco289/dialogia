'use client';
import { useChatStore } from '@/lib/store';
import { MessageList } from '@/components/chat/MessageList';
import { WelcomeHero } from '@/components/WelcomeHero';
import { Composer } from '@/components/chat/Composer';
import { useKeyboardInsets } from '@/lib/hooks/useKeyboardInsets';
import { useEffect, useState, type CSSProperties } from 'react';
import { selectActiveModelIds, selectCurrentChat } from '@/lib/store/selectors';
import { formatModelLabel, findModelById } from '@/lib/models';

export function ChatPane() {
  const chat = useChatStore(selectCurrentChat);
  const activeModelIds = useChatStore(selectActiveModelIds);
  const models = useChatStore((s) => s.models);
  const enableMultiModelChat = useChatStore((s) => !!s.ui.flags.enableMultiModelChat);
  const keyboardMetrics = useKeyboardInsets();
  const keyboardVars = {
    '--keyboard-offset': `${Math.max(0, Math.round(keyboardMetrics.offset))}px`,
  } as CSSProperties;
  const multiColumn = activeModelIds.length > 1 && enableMultiModelChat;
  const [activeModelId, setActiveModelId] = useState<string | undefined>(activeModelIds[0]);

  useEffect(() => {
    if (!activeModelIds.length) {
      setActiveModelId(undefined);
      return;
    }
    if (!activeModelId || !activeModelIds.includes(activeModelId)) {
      setActiveModelId(activeModelIds[0]);
    }
  }, [activeModelIds, activeModelId]);

  if (!chat) return <WelcomeHero keyboardMetrics={keyboardMetrics} />;
  return (
    <div className="h-full min-w-0 flex flex-col" style={keyboardVars}>
      <div className="flex-1 min-h-0 min-w-0">
        {multiColumn ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
              {activeModelIds.map((modelId) => {
                const meta = findModelById(models, modelId);
                const label = formatModelLabel({ model: meta, fallbackId: modelId });
                const isActive = modelId === activeModelId;
                return (
                  <button
                    key={modelId}
                    type="button"
                    className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveModelId(modelId)}
                  >
                    <span className="truncate max-w-[160px]">{label}</span>
                  </button>
                );
              })}
            </div>
            {activeModelId ? (
              <div className="flex-1 min-h-0">
                {(() => {
                  const meta = findModelById(models, activeModelId);
                  const label = formatModelLabel({ model: meta, fallbackId: activeModelId });
                  return (
                    <div className="flex flex-col rounded-[28px] border border-border/70 bg-muted/20 shadow-[var(--shadow-card)] overflow-hidden h-full">
                      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 bg-canvas/60">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold leading-tight tracking-wide">
                            {label}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono tracking-tight uppercase">
                            {activeModelId}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-1 rounded-full uppercase tracking-wider">
                          Model
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 px-3 pb-4 pt-2">
                        <div className="h-full rounded-2xl border border-border/50 bg-canvas shadow-[var(--shadow-card)] overflow-hidden">
                          <MessageList chatId={chat.id} modelFilter={activeModelId} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>
        ) : (
          <MessageList chatId={chat.id} />
        )}
      </div>
      <Composer keyboardMetrics={keyboardMetrics} />
      {/* Settings drawer is rendered at the app level so it's available on the welcome page too */}
    </div>
  );
}
