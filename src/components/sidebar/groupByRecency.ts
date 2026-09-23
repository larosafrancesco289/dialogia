import type { Chat } from '@/lib/types';

export type RecencyGroup = { label: string; chats: Chat[] };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Chats set out like a table of contents by when they were last touched:
 * Today, Previous 7 days, Previous 30 days, Earlier. Order within a group is
 * kept as given (the list arrives newest first); empty groups are dropped.
 */
export function groupByRecency(chats: Chat[], now: number = Date.now()): RecencyGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const buckets: RecencyGroup[] = [
    { label: 'Today', chats: [] },
    { label: 'Previous 7 days', chats: [] },
    { label: 'Previous 30 days', chats: [] },
    { label: 'Earlier', chats: [] },
  ];
  for (const chat of chats) {
    const at = chat.updatedAt ?? chat.createdAt ?? 0;
    const index = at >= today ? 0 : at >= today - 7 * DAY ? 1 : at >= today - 30 * DAY ? 2 : 3;
    buckets[index].chats.push(chat);
  }
  return buckets.filter((bucket) => bucket.chats.length > 0);
}
