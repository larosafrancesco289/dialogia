'use client';
import { useChatStore } from '@/lib/store';
import { MessageList } from '@/components/MessageList';
import { WelcomeHero } from '@/components/WelcomeHero';
import { Composer } from '@/components/Composer';
import { useKeyboardInsets } from '@/lib/hooks/useKeyboardInsets';
import { useMemo, type CSSProperties } from 'react';
import { selectCurrentChat } from '@/lib/store/selectors';
import { formatModelLabel, findModelById } from '@/lib/models';

export function ChatPane() {
  const chat = useChatStore(selectCurrentChat);
  const models = useChatStore((s) => s.models);
  const keyboardMetrics = useKeyboardInsets();
  const keyboardVars = {
    '--keyboard-offset': `${Math.max(0, Math.round(keyboardMetrics.offset))}px`,
  } as CSSProperties;
  const chatSettings = chat?.settings;
  const activeModelIds = useMemo(() => {
    const baseId = chatSettings?.model;
    const base = baseId ? [baseId] : [];
    const extras = Array.isArray(chatSettings?.parallel_models)
      ? (chatSettings?.parallel_models as string[])
      : [];
    const combined = base.concat(extras).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const deduped: string[] = [];
    for (const id of combined) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    return deduped.length ? deduped : base;
  }, [chatSettings?.model, chatSettings?.parallel_models]);
  const multiColumn = activeModelIds.length > 1;
  const primaryModelId = activeModelIds[0] || chatSettings?.model;

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
                      <span className="text-sm font-semibold leading-tight tracking-wide">{label}</span>
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
