import { ChatSidebarView } from '@/components/sidebar/ChatSidebarView';
import { useChatSidebarState } from '@/components/sidebar/useChatSidebarState';

interface ChatSidebarProps {
  collapsed?: boolean;
  /** Inside a sheet that brings its own title and close button. */
  embedded?: boolean;
}

export function ChatSidebar({ collapsed, embedded }: ChatSidebarProps = {}) {
  const state = useChatSidebarState({ collapsed });
  return <ChatSidebarView {...state} embedded={embedded} />;
}
