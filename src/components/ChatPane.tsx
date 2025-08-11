'use client';
import { useChatStore } from '@/lib/store';
import MessageList from '@/components/MessageList';
import Composer from '@/components/Composer';
import WelcomeHero from '@/components/WelcomeHero';

export default function ChatPane() {
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  if (!chat) return <WelcomeHero />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <MessageList chatId={chat.id} />
      </div>
      <div className="border-t border-border">
        <Composer />
      </div>
      {/* Settings drawer is rendered at the app level so it's available on the welcome page too */}
    </div>
  );
}
