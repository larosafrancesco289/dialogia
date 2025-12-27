'use client';
import { useChatStore } from '@/lib/store';
import { MessageList } from '@/components/chat/MessageList';
import { WelcomeHero } from '@/components/WelcomeHero';
import { Composer } from '@/components/chat/Composer';
import { useKeyboardInsets } from '@/lib/hooks/useKeyboardInsets';
import { type CSSProperties } from 'react';
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

  if (!chat) return <WelcomeHero keyboardMetrics={keyboardMetrics} />;
  return (
    <div className="h-full flex flex-col" style={keyboardVars}>
      <div className="flex-1 min-h-0">
        {multiColumn ? (
          <div className="grid h-full gap-4 md:gap-6 auto-rows-[minmax(0,1fr)] grid-cols-1 md:grid-cols-2">
            {activeModelIds.map((modelId) => {
              const meta = findModelById(models, modelId);
              const label = formatModelLabel({ model: meta, fallbackId: modelId });
              return (
                <div
                  key={modelId}
                  className="flex flex-col rounded-[28px] border border-border/70 bg-muted/20 shadow-[var(--shadow-card)] overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 bg-canvas/60">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold leading-tight tracking-wide">
                        {label}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono tracking-tight uppercase">
                        {modelId}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-1 rounded-full uppercase tracking-wider">
                      Model
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 px-3 pb-4 pt-2">
                    <div className="h-full rounded-2xl border border-border/50 bg-canvas shadow-[var(--shadow-card)] overflow-hidden">
                      <MessageList chatId={chat.id} modelFilter={modelId} />
                    </div>
                  </div>
                </div>
              );
            })}
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
