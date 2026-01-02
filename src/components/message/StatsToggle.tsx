import { MessageMeta } from '@/components/message/MessageMeta';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';

type StatsToggleProps = {
  showStats: boolean;
  waitingForFirstToken: boolean;
  isLatestAssistant: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  message: Message;
  chat?: Chat | null;
  models: ModelDescriptor[];
};

export function StatsToggle({
  showStats,
  waitingForFirstToken,
  isLatestAssistant,
  isExpanded,
  onToggle,
  message,
  chat,
  models,
}: StatsToggleProps) {
  if (!showStats || (waitingForFirstToken && isLatestAssistant) || !chat) return null;

  return (
    <div className="px-4 pb-3 -mt-2">
      {isExpanded ? (
        <div className="text-xs text-muted-foreground">
          <MessageMeta
            message={message}
            modelId={message.model || chat?.settings.modelId || 'unknown'}
            chatSettings={chat.settings}
            models={models}
            showStats={true}
          />
          <div className="mt-1">
            <button className="badge" onClick={onToggle}>
              Hide stats
            </button>
          </div>
        </div>
      ) : (
        <button className="badge" onClick={onToggle}>
          stats
        </button>
      )}
    </div>
  );
}
