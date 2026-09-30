import type { CarriedOver } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { carriedOverWords } from '@/modules/tutor/ui/messageViews';
import { Markdown } from '@/components/Markdown';

/** Where a carried-over estimate came from, naming the source chat by its title today. */
export function CarriedOverWords({
  carried,
  setTo,
  topic,
}: {
  carried: CarriedOver;
  setTo: number;
  topic: string;
}) {
  const title = useChatStore((s) => s.chats.find((chat) => chat.id === carried.chatId)?.title);
  return (
    <Markdown
      inline
      content={carriedOverWords(carried, setTo, topic, title?.trim() || undefined)}
    />
  );
}
