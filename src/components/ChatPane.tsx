'use client';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import MessageList from '@/components/MessageList';
import WelcomeHero from '@/components/WelcomeHero';
import Composer from '@/components/Composer';
import { useKeyboardInsets } from '@/lib/hooks/useKeyboardInsets';
import type { CSSProperties } from 'react';

export default function ChatPane() {
  const { chats, selectedChatId } = useChatStore(
    (s) => ({ chats: s.chats, selectedChatId: s.selectedChatId }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const keyboardMetrics = useKeyboardInsets();
  const keyboardVars = {
    '--keyboard-offset': `${Math.max(0, Math.round(keyboardMetrics.offset))}px`,
  } as CSSProperties;
  if (!chat) return <WelcomeHero keyboardMetrics={keyboardMetrics} />;

  return (
    <div className="h-full flex flex-col" style={keyboardVars}>
      <div className="flex-1 min-h-0">
        <MessageList chatId={chat.id} />
      </div>
      <Composer keyboardMetrics={keyboardMetrics} />
      {/* Settings drawer is rendered at the app level so it's available on the welcome page too */}
    </div>
  );
}
