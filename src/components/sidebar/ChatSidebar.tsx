'use client';
import { ChatSidebarView } from '@/components/sidebar/ChatSidebarView';
import { useChatSidebarState } from '@/components/sidebar/useChatSidebarState';

interface ChatSidebarProps {
  collapsed?: boolean;
}

export function ChatSidebar({ collapsed }: ChatSidebarProps = {}) {
  const state = useChatSidebarState({ collapsed });
  return <ChatSidebarView {...state} />;
}
