import type { CarriedOver } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { memoryOnInChat } from '@/lib/memory/notebook';
import { carriedOverWords } from '@/modules/tutor/ui/messageViews';
import { Markdown } from '@/components/Markdown';
import { useT } from '@/modules/tutor/i18n';

/**
 * Where a carried-over estimate came from, naming the source chat by its title
 * today, unless that chat has since been kept out of memory: then it is only
 * "another tutor chat".
 */
export function CarriedOverWords({
  carried,
  setTo,
  topic,
}: {
  carried: CarriedOver;
  setTo: number;
  topic: string;
}) {
  useT();
  const title = useChatStore((s) => {
    const source = s.chats.find((chat) => chat.id === carried.chatId);
    return source && memoryOnInChat(s.ui, source) ? source.title : undefined;
  });
  return (
    <Markdown
      inline
      content={carriedOverWords(carried, setTo, topic, title?.trim() || undefined)}
    />
  );
}
