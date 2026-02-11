import type { Message } from '@/lib/types';
import { useMessageWindow } from '@/components/message/hooks/useMessageWindow';
import { useMessageScrolling } from '@/components/message/useMessageScrolling';

export function useMessageListWindow(args: {
  messages: Message[];
  chatId: string;
  isStreaming: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  isAssistantPlaceholder: (message?: Message, previous?: Message) => boolean;
  onScrollAway?: () => void;
  pageSize?: number;
  autoScrollPreference?: boolean;
}) {
  const {
    messages,
    chatId,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway,
    pageSize = 150,
    autoScrollPreference,
  } = args;
  const { visibleItems, hiddenCount, showMore } = useMessageWindow(messages, {
    pageSize,
    resetKey: chatId,
  });
  const { containerRef, contentRef, endRef, showJump, jumpToLatest } = useMessageScrolling({
    messages,
    chatId,
    isStreaming,
    isMobile,
    prefersReducedMotion,
    isAssistantPlaceholder,
    onScrollAway,
    autoScrollPreference,
  });

  return {
    visibleMessages: visibleItems,
    hiddenCount,
    showMore,
    containerRef,
    contentRef,
    endRef,
    showJump,
    jumpToLatest,
  };
}
