import { useChatStore } from '@/lib/store';
import { MessageList } from '@/components/chat/MessageList';
import { WelcomeHero } from '@/components/WelcomeHero';
import { Composer } from '@/components/chat/Composer';
import { useKeyboardInsets } from '@/lib/hooks/useKeyboardInsets';
import { type CSSProperties } from 'react';
import { selectCurrentChat, selectOnWelcomePage } from '@/lib/store/selectors';

export function ChatPane() {
  const chat = useChatStore(selectCurrentChat);
  const hydrated = useChatStore((s) => s.hydrated);
  const onWelcome = useChatStore(selectOnWelcomePage);
  const keyboardMetrics = useKeyboardInsets();
  const keyboardVars = {
    '--keyboard-offset': `${Math.max(0, Math.round(keyboardMetrics.offset))}px`,
  } as CSSProperties;
  // Until the saved chats are read there is nothing to show: the welcome
  // page here would flash before the chat you left comes back.
  if (!hydrated) return <div className="chat-pane h-full" aria-busy="true" />;
  if (!chat || onWelcome) return <WelcomeHero keyboardMetrics={keyboardMetrics} />;
  return (
    <div className="chat-pane relative h-full min-w-0 flex flex-col" style={keyboardVars}>
      <div className="chat-pane__scroll flex-1 min-h-0 min-w-0">
        <MessageList chatId={chat.id} />
      </div>
      <div className="chat-pane__fade" aria-hidden />
      <Composer keyboardMetrics={keyboardMetrics} />
      {/* Settings drawer is rendered at the app level so it's available on the welcome page too */}
    </div>
  );
}
